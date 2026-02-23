import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const jsonH = { ...corsHeaders, "Content-Type": "application/json" };

interface SendRequest {
  appointment_id?: string;
  company_id: string;
  type: "confirmation" | "reminder" | "cancellation" | "reschedule" | "confirmation_request" | "test";
  phone?: string;
}

function replacePlaceholders(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || "");
}

function log(...args: any[]) {
  console.log("[send-whatsapp]", new Date().toISOString(), ...args);
}

function logErr(...args: any[]) {
  console.error("[send-whatsapp]", new Date().toISOString(), ...args);
}

Deno.serve(async (req) => {
  log("🔵 REQUEST RECEIVED", req.method, req.url);
  log("🔵 Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));

  if (req.method === "OPTIONS") {
    log("🔵 CORS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const raw = await req.text();
    log("🔵 RAW BODY (first 500):", raw.substring(0, 500));
    log("🔵 RAW BODY length:", raw.length);

    let body: any;
    try {
      body = JSON.parse(raw);
      log("🔵 PARSED JSON keys:", Object.keys(body));
    } catch (e) {
      log("⚠️ BAD JSON, skipping:", e);
      return new Response(JSON.stringify({ ok: true, skipped: "bad_json" }), { headers: jsonH });
    }

    // ─── Detect UAZAPI webhook payload ───
    const urlParams = new URL(req.url).searchParams;
    const uazapiCompanyId = urlParams.get("company_id") || body.company_id_webhook;
    log("🔵 company_id from URL:", urlParams.get("company_id"), "from body:", body.company_id_webhook, "final:", uazapiCompanyId);
    log("🔵 body.type:", body.type, "body.action:", body.action, "body.event:", body.event);

    const isUazapiWebhook = uazapiCompanyId && !body.type && !body.action && (
      body.event || body.data || (body.phone && body.message && !body.appointment_id)
    );
    log("🔵 isUazapiWebhook:", isUazapiWebhook);

    if (isUazapiWebhook) {
      log("📩 UAZAPI WEBHOOK DETECTED, cid:", uazapiCompanyId);

      // ── Resolve instance_id from payload (instanceName or token) ──
      const payloadInstanceName = body.instanceName || body.instance_name || null;
      const payloadToken = body.token || null;
      let resolvedInstanceId: string | null = null;

      if (payloadInstanceName || payloadToken) {
        try {
          if (payloadInstanceName) {
            const { data: instRow } = await supabase.from("whatsapp_instances")
              .select("id, company_id").eq("instance_name", payloadInstanceName).maybeSingle();
            if (instRow?.id) resolvedInstanceId = instRow.id;
          }
          if (!resolvedInstanceId && payloadToken) {
            const { data: instRow } = await supabase.from("whatsapp_instances")
              .select("id, company_id").eq("token", payloadToken).maybeSingle();
            if (instRow?.id) resolvedInstanceId = instRow.id;
          }
          log("📩 Resolved instance_id:", resolvedInstanceId, "from instanceName:", payloadInstanceName);
        } catch (resolveErr) {
          log("⚠️ Could not resolve instance_id in send-whatsapp:", resolveErr);
        }
      }

      const phone = body.phone || body.from || body.data?.from ||
        body.data?.key?.remoteJid?.replace("@s.whatsapp.net", "") || null;
      const msg = body.message || body.text || body.data?.message?.conversation ||
        body.data?.message?.extendedTextMessage?.text || null;

      log("📩 Extracted phone:", phone, "msg:", msg?.substring(0, 100));
      log("📩 body.phone:", body.phone, "body.from:", body.from);
      log("📩 body.message:", body.message, "body.text:", body.text);
      log("📩 body.data:", JSON.stringify(body.data)?.substring(0, 300));

      // Check if message is from the business itself (fromMe)
      const fromMe = body.fromMe === true || body.data?.fromMe === true;
      log("📩 fromMe:", fromMe);
      if (fromMe) {
        log("📩 Skipping own message (fromMe=true)");
        return new Response(JSON.stringify({ ok: true, skipped: "from_me" }), { headers: jsonH });
      }

      // Detect audio messages
      const isAudio = body.data?.message?.audioMessage || body.data?.messageType === "audioMessage";
      const audioMediaUrl = body.data?.message?.audioMessage?.url || body.data?.mediaUrl || null;
      const audioMsgId = body.data?.key?.id || body.data?.messageId || null;
      log("📩 isAudio:", !!isAudio, "audioMediaUrl:", audioMediaUrl ? "yes" : "no", "audioMsgId:", audioMsgId);

      if (!phone || (!msg && !isAudio)) {
        log("⚠️ No phone or msg found, skipping");
        return new Response(JSON.stringify({ ok: true, skipped: "no_msg" }), { headers: jsonH });
      }

      // ── Message Debounce / Aggregation ──
      // Strategy: Each incoming message is saved as 'pending' immediately.
      // Then we try to acquire a per-conversation processing LOCK by inserting a
      // special 'locking' row into whatsapp_messages. Only ONE worker succeeds
      // (unique constraint via metadata check). The lock winner waits the debounce
      // delay, collects ALL pending msgs, concatenates, calls handleAgent ONCE.
      // Losers (concurrent workers) detect the existing lock and exit immediately.

      // ── Load agent settings scoped to this specific instance (with company fallback) ──
      let agSettingsDelay: any = null;
      if (resolvedInstanceId) {
        const { data } = await supabase
          .from("whatsapp_agent_settings")
          .select("message_delay_enabled, message_delay_seconds, enabled")
          .eq("company_id", uazapiCompanyId)
          .eq("instance_id", resolvedInstanceId)
          .maybeSingle();
        agSettingsDelay = data;
        log("📩 Loaded instance-specific agent settings for debounce, instance:", resolvedInstanceId, "found:", !!agSettingsDelay);
      }
      if (!agSettingsDelay) {
        const { data } = await supabase
          .from("whatsapp_agent_settings")
          .select("message_delay_enabled, message_delay_seconds, enabled")
          .eq("company_id", uazapiCompanyId)
          .is("instance_id", null)
          .maybeSingle();
        agSettingsDelay = data;
        log("📩 Loaded company-default agent settings for debounce, found:", !!agSettingsDelay);
      }

      if (agSettingsDelay?.enabled && agSettingsDelay?.message_delay_enabled && !isAudio) {
        const delaySeconds = Math.max(2, Math.min(30, agSettingsDelay.message_delay_seconds || 8));
        log("⏳ Debounce enabled:", delaySeconds, "s");

        // ── Step 1: Get or create conversation (scoped to this instance) ──
        let convQueryDelay = supabase
          .from("whatsapp_conversations")
          .select("id, handoff_requested")
          .eq("company_id", uazapiCompanyId)
          .eq("phone", phone)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1);
        if (resolvedInstanceId) {
          convQueryDelay = convQueryDelay.eq("instance_id", resolvedInstanceId);
        } else {
          convQueryDelay = convQueryDelay.is("instance_id", null);
        }
        let { data: delayConv } = await convQueryDelay.single();

        if (!delayConv) {
          const newConvData: any = { company_id: uazapiCompanyId, phone, status: "active" };
          if (resolvedInstanceId) newConvData.instance_id = resolvedInstanceId;
          const { data: nc } = await supabase
            .from("whatsapp_conversations")
            .insert(newConvData)
            .select("id, handoff_requested")
            .single();
          delayConv = nc;
        }

        if (!delayConv?.id) {
          log("⏳ ❌ Could not get/create conversation, falling through...");
        } else {
          // Skip if handoff is active — human is handling this
          if (delayConv.handoff_requested) {
            log("⏳ Handoff active, skipping");
            return new Response(JSON.stringify({ ok: true, skipped: "handoff" }), { headers: jsonH });
          }

          const convId = delayConv.id;
          const arrivalMs = Date.now();

          // ── Step 2: Save this message immediately as 'pending' ──
          await supabase.from("whatsapp_messages").insert({
            conversation_id: convId,
            company_id: uazapiCompanyId,
            direction: "incoming",
            message_type: "text",
            content: msg,
            delivery_status: "pending",
            metadata: { buffered: true, arrival_ms: arrivalMs },
          });
          log("⏳ Message saved as pending, arrival_ms:", arrivalMs);

          // ── Step 3: Try to acquire the processing LOCK ──
          // The lock is a special outgoing message with delivery_status='locking'.
          // We check if a lock already exists within the last (delay + 60)s window.
          const lockWindowStart = new Date(arrivalMs - (delaySeconds + 60) * 1000).toISOString();
          const { data: existingLock } = await supabase
            .from("whatsapp_messages")
            .select("id, created_at, metadata")
            .eq("conversation_id", convId)
            .eq("direction", "outgoing")
            .eq("delivery_status", "locking")
            .gte("created_at", lockWindowStart)
            .limit(1)
            .single();

          if (existingLock) {
            // Another worker already holds the lock — we are done here.
            // That worker will pick up our 'pending' message when it collects all buffered msgs.
            log("⏳ Lock already held by another worker (lock id:", existingLock.id, ") — exiting.");
            return new Response(JSON.stringify({ ok: true, skipped: "lock_held_by_other" }), { headers: jsonH });
          }

          // ── Step 4: No lock found — WE acquire it ──
          const { data: lockRow, error: lockErr } = await supabase.from("whatsapp_messages").insert({
            conversation_id: convId,
            company_id: uazapiCompanyId,
            direction: "outgoing",
            message_type: "text",
            content: "__DEBOUNCE_LOCK__",
            delivery_status: "locking",
            metadata: { lock: true, acquired_ms: arrivalMs, delay_seconds: delaySeconds },
          }).select("id").single();

          if (lockErr || !lockRow?.id) {
            log("⏳ ❌ Failed to insert lock row, falling through to direct handleAgent...");
          } else {
            const lockId = lockRow.id;
            log("⏳ 🔒 Lock acquired! id:", lockId, "Waiting", delaySeconds, "s...");

            // ── Step 5: Wait the full debounce delay ──
            await new Promise(r => setTimeout(r, delaySeconds * 1000));

            // ── Step 6: Collect ALL pending messages from the buffer window ──
            // We look back far enough to capture all messages from this burst
            const bufferWindowStart = new Date(arrivalMs - 5000).toISOString();
            const { data: bufferedMsgs } = await supabase
              .from("whatsapp_messages")
              .select("id, content, created_at")
              .eq("conversation_id", convId)
              .eq("direction", "incoming")
              .eq("delivery_status", "pending")
              .gte("created_at", bufferWindowStart)
              .order("created_at", { ascending: true });

            log("⏳ Buffered messages collected:", bufferedMsgs?.length || 0);

            // ── Step 7: Release lock regardless of outcome ──
            await supabase
              .from("whatsapp_messages")
              .delete()
              .eq("id", lockId);
            log("⏳ 🔓 Lock released");

            if (!bufferedMsgs || bufferedMsgs.length === 0) {
              log("⏳ No pending messages found after delay, skipping.");
              return new Response(JSON.stringify({ ok: true, skipped: "no_pending_after_delay" }), { headers: jsonH });
            }

            // ── Step 8: Mark all buffered messages as 'read' (processed) ──
            const msgIds = bufferedMsgs.map((m: any) => m.id);
            await supabase
              .from("whatsapp_messages")
              .update({ delivery_status: "read", metadata: { buffered: false, aggregated: true, source_count: bufferedMsgs.length } })
              .in("id", msgIds);

            // ── Step 9: Concatenate all messages into a single text ──
            const concatenatedMsg = bufferedMsgs
              .map((m: any) => m.content?.trim())
              .filter(Boolean)
              .join("\n");
            log("⏳ Concatenated (", bufferedMsgs.length, "msgs):", concatenatedMsg.substring(0, 300));

            // ── Step 10: Call handleAgent ONCE with the full aggregated context ──
            const t0 = Date.now();
            try {
              const result = await handleAgent(
                supabase, uazapiCompanyId, phone, concatenatedMsg,
                { is_audio: false, audio_media_url: null, audio_media_key: null, audio_message_id: null },
                { skipIncomingSave: true, existingConvId: convId, instanceId: resolvedInstanceId }
              );
              const elapsed = Date.now() - t0;
              log("✅ handleAgent (debounced) done in", elapsed, "ms, msgs aggregated:", bufferedMsgs.length, "instanceId:", resolvedInstanceId);

              try {
                // Fetch instance name for enriched log
                let instanceName: string | null = null;
                if (resolvedInstanceId) {
                  const { data: instRow } = await supabase.from("whatsapp_instances").select("instance_name, label, phone_number").eq("id", resolvedInstanceId).maybeSingle();
                  instanceName = instRow?.label || instRow?.instance_name || null;
                }
                // Load agent settings for model/temp logging
                let agLog: any = null;
                if (resolvedInstanceId) {
                  const { data: d } = await supabase.from("whatsapp_agent_settings").select("ai_model, temperature, preferred_provider").eq("company_id", uazapiCompanyId).eq("instance_id", resolvedInstanceId).maybeSingle();
                  agLog = d;
                }
                if (!agLog) {
                  const { data: d } = await supabase.from("whatsapp_agent_settings").select("ai_model, temperature, preferred_provider").eq("company_id", uazapiCompanyId).is("instance_id", null).maybeSingle();
                  agLog = d;
                }
                await supabase.from("whatsapp_agent_logs").insert({
                  company_id: uazapiCompanyId,
                  conversation_id: result.conversation_id || convId,
                  action: "response_sent",
                  details: {
                    response_time_ms: elapsed,
                    aggregated_messages: bufferedMsgs.length,
                    debounce_seconds: delaySeconds,
                    instance_id: resolvedInstanceId,
                    instance_name: instanceName,
                    ai_model: agLog?.ai_model || "google/gemini-3-flash-preview",
                    temperature: agLog?.temperature ?? 0.3,
                    provider: agLog?.preferred_provider || "lovable",
                    phone,
                  },
                });
              } catch (_logErr) { /* non-critical */ }

              return new Response(JSON.stringify({ ok: true, ...result }), { headers: jsonH });
            } catch (agentErr: any) {
              logErr("❌ handleAgent (debounced) THREW:", agentErr.message);
              return new Response(JSON.stringify({ error: agentErr.message }), { status: 500, headers: jsonH });
            }
          }
        }
      }

      // ── Fallback (debounce disabled): simple per-conversation lock already inside handleAgent
      log("🚀 CALLING handleAgent (debounce disabled)... instanceId:", resolvedInstanceId);
      const t0 = Date.now();
      try {
        const result = await handleAgent(supabase, uazapiCompanyId, phone, msg || "[áudio]", {
          is_audio: !!isAudio,
          audio_media_url: audioMediaUrl,
          audio_message_id: audioMsgId,
        }, { instanceId: resolvedInstanceId });
        const elapsed = Date.now() - t0;
        log("✅ handleAgent completed in", elapsed, "ms, instanceId:", resolvedInstanceId);

        try {
          // Fetch instance name for enriched log
          let instanceNameFb: string | null = null;
          if (resolvedInstanceId) {
            const { data: instRowFb } = await supabase.from("whatsapp_instances").select("instance_name, label, phone_number").eq("id", resolvedInstanceId).maybeSingle();
            instanceNameFb = instRowFb?.label || instRowFb?.instance_name || null;
          }
          // Load agent settings for model/temp logging
          let agLogFb: any = null;
          if (resolvedInstanceId) {
            const { data: d } = await supabase.from("whatsapp_agent_settings").select("ai_model, temperature, preferred_provider").eq("company_id", uazapiCompanyId).eq("instance_id", resolvedInstanceId).maybeSingle();
            agLogFb = d;
          }
          if (!agLogFb) {
            const { data: d } = await supabase.from("whatsapp_agent_settings").select("ai_model, temperature, preferred_provider").eq("company_id", uazapiCompanyId).is("instance_id", null).maybeSingle();
            agLogFb = d;
          }
          await supabase.from("whatsapp_agent_logs").insert({
            company_id: uazapiCompanyId,
            conversation_id: result.conversation_id || null,
            action: "response_sent",
            details: {
              response_time_ms: elapsed,
              is_audio: !!isAudio,
              instance_id: resolvedInstanceId,
              instance_name: instanceNameFb,
              ai_model: agLogFb?.ai_model || "google/gemini-3-flash-preview",
              temperature: agLogFb?.temperature ?? 0.3,
              provider: agLogFb?.preferred_provider || "lovable",
              phone,
            },
          });
        } catch (_logErr) { /* non-critical */ }

        return new Response(JSON.stringify({ ok: true, ...result }), { headers: jsonH });
      } catch (agentErr: any) {
        logErr("❌ handleAgent THREW:", agentErr.message, agentErr.stack);
        return new Response(JSON.stringify({ error: agentErr.message }), { status: 500, headers: jsonH });
      }
    }

    // ─── Agent processing route (internal call) ───
    if (body.action === "agent-process") {
      log("🔵 agent-process route, is_audio:", body.is_audio, "is_media:", body.is_media, "media_type:", body.media_type, "button_response:", body.button_response_id || "none", "wa_message_id:", body.wa_message_id || "none", "instance_id:", body.instance_id || "none");
      
      // If this is a button/list response, enrich the message with context
      let agentMessage = body.message;
      if (body.button_response_id) {
        agentMessage = `[BOTÃO CLICADO: id="${body.button_response_id}" texto="${body.button_response_text || body.message}"] ${body.message}`;
        log("🔘 Enriched message with button context:", agentMessage);
      }
      
      const result = await handleAgent(supabase, body.company_id, body.phone, agentMessage, {
        is_audio: body.is_audio || false,
        audio_media_url: body.audio_media_url || null,
        audio_media_key: body.audio_media_key || null,
        audio_message_id: body.audio_message_id || null,
        audio_wa_msg_id: body.audio_wa_msg_id || null,
        audio_chat_id: body.audio_chat_id || null,
        wa_message_id: body.wa_message_id || null,
        is_media: body.is_media || false,
        media_type: body.media_type || null,
        media_url: body.media_url || null,
        media_key: body.media_key || null,
        media_message_id: body.media_message_id || null,
        media_mime_type: body.media_mime_type || null,
        media_caption: body.media_caption || null,
      }, {
        skipIncomingSave: body.skip_incoming_save || false,
        existingConvId: body.existing_conv_id || undefined,
        instanceId: body.instance_id || null,
      });
      return new Response(JSON.stringify(result), { headers: jsonH, status: result.error ? 500 : 200 });
    }

    // ─── Reaction trigger route (emoji reaction from client) ───
    if (body.action === "reaction-trigger") {
      log("😀 Reaction trigger! emoji:", body.emoji, "phone:", body.phone, "company:", body.company_id);
      const result = await handleReactionTrigger(supabase, body.company_id, body.phone, body.emoji, body.reacted_message_id);
      return new Response(JSON.stringify(result), { headers: jsonH });
    }

    // ─── Original send-whatsapp logic ───
    log("🔵 Standard send-whatsapp route");
    const { company_id, type, appointment_id, phone } = body as SendRequest;

    if (!company_id) return new Response(JSON.stringify({ error: "company_id is required" }), { status: 400, headers: jsonH });

    const { data: settings, error: settingsErr } = await supabase.from("whatsapp_settings").select("*").eq("company_id", company_id).single();
    if (settingsErr || !settings) return new Response(JSON.stringify({ error: "WhatsApp settings not found" }), { status: 404, headers: jsonH });
    if (!settings.active) return new Response(JSON.stringify({ error: "WhatsApp integration is disabled" }), { status: 400, headers: jsonH });
    if (!settings.base_url || !settings.instance_id || !settings.token) return new Response(JSON.stringify({ error: "Incomplete UAZAPI credentials" }), { status: 400, headers: jsonH });

    if (type === "test") {
      if (!phone) return new Response(JSON.stringify({ error: "phone is required for test" }), { status: 400, headers: jsonH });
      const result = await sendUazapiMessage(settings, phone, "✅ Teste de conexão UAZAPI realizado com sucesso!");
      return new Response(JSON.stringify({ success: true, result }), { headers: jsonH });
    }

    if (!appointment_id) return new Response(JSON.stringify({ error: "appointment_id is required" }), { status: 400, headers: jsonH });

    const { data: appointment, error: apptErr } = await supabase.from("appointments").select("*, services(name), companies:company_id(name, address)").eq("id", appointment_id).single();
    if (apptErr || !appointment) return new Response(JSON.stringify({ error: "Appointment not found" }), { status: 404, headers: jsonH });

    const { data: templateRow } = await supabase.from("message_templates").select("template").eq("company_id", company_id).eq("type", type).eq("active", true).single();
    if (!templateRow) return new Response(JSON.stringify({ error: `No active template for type: ${type}` }), { status: 404, headers: jsonH });

    const placeholders: Record<string, string> = {
      cliente_nome: appointment.client_name,
      data: formatDate(appointment.appointment_date),
      hora: appointment.start_time?.substring(0, 5) || "",
      servico: (appointment as any).services?.name || "",
      empresa_nome: (appointment as any).companies?.name || "",
      endereco: (appointment as any).companies?.address || "",
    };

    const message = replacePlaceholders(templateRow.template, placeholders);
    const targetPhone = appointment.client_phone.replace(/\D/g, "");
    let status = "sent";
    let error: string | null = null;
    let responsePayload: any = null;

    try { responsePayload = await sendUazapiMessage(settings, targetPhone, message); }
    catch (e) { status = "error"; error = e instanceof Error ? e.message : String(e); }

    await supabase.from("whatsapp_logs").insert({ company_id, appointment_id, phone: targetPhone, type, status, error, payload: responsePayload ? { response: responsePayload, message } : { message, error } });

    return new Response(JSON.stringify({ success: status === "sent", status, error }), { headers: jsonH });
  } catch (e: any) {
    logErr("❌ TOP-LEVEL ERROR:", e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500, headers: jsonH });
  }
});

// ─── Helper: get WS credentials for the correct instance ───
// Strategy:
// 1. If instanceId provided, ALWAYS prefer whatsapp_instances token (most up-to-date).
// 2. whatsapp_settings.token can become stale when tokens are rotated by the provider.
// 3. Only fall back to whatsapp_settings token if whatsapp_instances has no token.
async function getWsCredentials(sb: any, companyId: string, instanceId?: string | null) {
  // Fetch whatsapp_settings for base_url (shared per company)
  const { data: ws } = await sb
    .from("whatsapp_settings")
    .select("base_url, instance_id, token, active")
    .eq("company_id", companyId)
    .maybeSingle();

  const baseUrl = ws?.base_url || "https://sistembr.uazapi.com";

  if (instanceId) {
    const { data: inst } = await sb
      .from("whatsapp_instances")
      .select("instance_name, token, status, is_primary")
      .eq("id", instanceId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (inst) {
      // ALWAYS prefer whatsapp_instances token — it is the most current
      // (whatsapp_settings.token can be stale after token rotations)
      if (inst.token) {
        log("🔑 Using whatsapp_instances token for instance:", inst.instance_name, "primary:", inst.is_primary);
        return {
          base_url: baseUrl,
          instance_id: inst.instance_name,
          token: inst.token,
          active: inst.status === "connected",
        };
      }

      // Instance has no token in whatsapp_instances — fall back to whatsapp_settings
      if (ws?.token) {
        log("🔑 Instance has no token in whatsapp_instances, falling back to whatsapp_settings token");
        return {
          base_url: baseUrl,
          instance_id: inst.instance_name,
          token: ws.token,
          active: inst.status === "connected",
        };
      }
    }
  }

  // No instanceId provided — fall back to legacy whatsapp_settings (primary instance)
  log("🔑 No instanceId, using whatsapp_settings (legacy primary)");
  return ws || null;
}


async function sendUazapiMessage(settings: { base_url: string; instance_id: string; token: string }, phone: string, message: string): Promise<any> {
  const url = settings.base_url.replace(/\/$/, "") + "/send/text";
  log("📤 SENDING via UAZAPI:", url, "phone:", phone, "len:", message.length);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", token: settings.token }, body: JSON.stringify({ number: phone, text: message }) });
  const text = await res.text();
  log("📤 UAZAPI response:", res.status, text.substring(0, 300));
  if (!res.ok) throw new Error(`UAZAPI error ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ─── Send "composing" presence to simulate typing ───
async function sendTypingPresence(settings: { base_url: string; token: string }, phone: string): Promise<void> {
  try {
    const url = settings.base_url.replace(/\/$/, "") + "/send/presence";
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: settings.token },
      body: JSON.stringify({ phone, presence: "composing" }),
    });
  } catch {
    // Non-fatal: ignore typing indicator errors
  }
}

// ─── Send reply as a SINGLE unified message ───
// All AI responses are sent as one message to avoid confusion, ordering issues,
// and duplicate greetings caused by multiple message chunks.
function splitIntoHumanMessages(text: string): string[] {
  // Always return as a single message — no splitting
  const clean = text.trim();
  return clean ? [clean] : [];
}

// ─── Send reply as a SINGLE message with a brief typing indicator ───
// Sending one unified message prevents ordering issues and duplicate senders.
async function sendHumanizedReply(
  settings: { base_url: string; instance_id: string; token: string },
  phone: string,
  fullReply: string
): Promise<void> {
  const chunks = splitIntoHumanMessages(fullReply);
  if (chunks.length === 0) return;
  
  // Brief typing presence before sending — feels natural
  await sendTypingPresence(settings, phone);
  await new Promise(r => setTimeout(r, 600 + Math.floor(Math.random() * 400)));
  
  // Send as a single unified message
  await sendUazapiMessage(settings, phone, chunks[0]);
  log("🗣️ Single reply sent:", chunks[0].length, "chars");
}

function formatDate(dateStr: string): string { const [y, m, d] = dateStr.split("-"); return `${d}/${m}/${y}`; }

// ─── Normalize HH:MM to natural PT-BR speech ───
function normalizeTimeForSpeech(text: string): string {
  return text.replace(/\b(\d{1,2}):(\d{2})\b/g, (_match, hStr, mStr) => {
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (h === 0 && m === 0) return "meia-noite";
    if (h === 12 && m === 0) return "meio-dia";
    
    // Period label
    let period = "";
    if (h >= 5 && h < 12) period = " da manhã";
    else if (h >= 12 && h < 18) period = " da tarde";
    else if (h >= 18 || h < 5) period = " da noite";

    const displayH = h > 12 ? h - 12 : h;
    const hourWord = displayH === 1 ? "uma" : displayH === 2 ? "duas" : String(displayH);

    // Return ONLY the natural form — no numeric prefix
    if (m === 0) return `${hourWord}${period}`;
    if (m === 30) return `${hourWord} e meia${period}`;
    if (m === 15) return `${hourWord} e quinze${period}`;
    if (m === 45) return `${hourWord} e quarenta e cinco${period}`;
    return `${hourWord} e ${m}${period}`;
  });
}

// ─── WhatsApp Media Decryption ───
async function decryptWhatsAppMedia(encryptedData: Uint8Array, mediaKeyB64: string, mediaType: string = "audio"): Promise<Uint8Array> {
  log("🔐 Decrypting WhatsApp media, encrypted size:", encryptedData.length, "type:", mediaType);
  
  // Info strings for HKDF by media type
  const infoStrings: Record<string, string> = {
    audio: "WhatsApp Audio Keys",
    ptt: "WhatsApp Audio Keys",
    image: "WhatsApp Image Keys",
    video: "WhatsApp Video Keys",
    document: "WhatsApp Document Keys",
  };
  const info = new TextEncoder().encode(infoStrings[mediaType] || infoStrings.audio);
  
  // Decode the base64 mediaKey (32 bytes)
  const mediaKeyBytes = Uint8Array.from(atob(mediaKeyB64), c => c.charCodeAt(0));
  log("🔐 mediaKey decoded:", mediaKeyBytes.length, "bytes");
  
  // Import mediaKey for HKDF
  const hkdfKey = await crypto.subtle.importKey("raw", mediaKeyBytes, "HKDF", false, ["deriveBits"]);
  
  // Derive 112 bytes using HKDF-SHA256
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
    hkdfKey,
    112 * 8 // bits
  );
  const derived = new Uint8Array(derivedBits);
  
  // Split derived key material
  const iv = derived.slice(0, 16);        // 16 bytes IV
  const cipherKey = derived.slice(16, 48); // 32 bytes AES-256 key
  // macKey = derived.slice(48, 80);       // 32 bytes MAC key (not needed for decryption)
  // refKey = derived.slice(80, 112);      // 32 bytes ref key (unused)
  
  // The encrypted file has 10 bytes of MAC at the end
  const encFile = encryptedData.slice(0, encryptedData.length - 10);
  
  // Import AES key and decrypt
  const aesKey = await crypto.subtle.importKey("raw", cipherKey, { name: "AES-CBC" }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, encFile);
  
  log("🔐 Decrypted successfully:", decrypted.byteLength, "bytes");
  return new Uint8Array(decrypted);
}

// ─── Audio Transcription via ElevenLabs STT ───
async function transcribeAudio(audioUrl: string, wsSettings: any, mediaKey?: string | null): Promise<string> {
  log("🎵 Transcribing audio from:", audioUrl.substring(0, 100));
  
  // Download audio from URL
  let audioData: Uint8Array;
  try {
    const headers: Record<string, string> = {};
    // If URL is from UAZAPI, include token
    if (wsSettings?.token && audioUrl.includes(wsSettings.base_url?.replace("https://", "").replace("http://", ""))) {
      headers.token = wsSettings.token;
    }
    const audioRes = await fetch(audioUrl, { headers });
    if (!audioRes.ok) throw new Error(`Download failed: ${audioRes.status}`);
    audioData = new Uint8Array(await audioRes.arrayBuffer());
    log("🎵 Audio downloaded:", audioData.length, "bytes");
  } catch (e: any) {
    logErr("🎵 Audio download error:", e.message);
    throw new Error("audio_download_failed: " + e.message);
  }

  // If we have a mediaKey, the file is encrypted WhatsApp media - decrypt it
  if (mediaKey) {
    try {
      audioData = await decryptWhatsAppMedia(audioData, mediaKey, "audio");
      log("🎵 Audio decrypted successfully:", audioData.length, "bytes");
    } catch (e: any) {
      logErr("🎵 WhatsApp media decryption failed:", e.message);
      // Continue with raw data as fallback (maybe it's not encrypted)
    }
  }

  // Transcribe using ElevenLabs STT
  const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY_CUSTOM") || Deno.env.get("ELEVENLABS_API_KEY");
  if (elevenLabsKey) {
    try {
      const formData = new FormData();
      formData.append("file", new Blob([audioData], { type: "audio/ogg" }), "audio.ogg");
      formData.append("model_id", "scribe_v2");
      formData.append("language_code", "por");

      const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": elevenLabsKey },
        body: formData,
      });

      if (sttRes.ok) {
        const result = await sttRes.json();
        log("🎵 ElevenLabs STT result:", result.text?.substring(0, 200));
        if (result.text) return result.text;
      } else {
        const errText = await sttRes.text();
        logErr("🎵 ElevenLabs STT error:", sttRes.status, errText.substring(0, 200));
      }
    } catch (e: any) {
      logErr("🎵 ElevenLabs STT exception:", e.message);
    }
  }

  // Fallback: OpenAI Whisper
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    try {
      const formData = new FormData();
      formData.append("file", new Blob([audioData], { type: "audio/ogg" }), "audio.ogg");
      formData.append("model", "whisper-1");
      formData.append("language", "pt");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
      });

      if (whisperRes.ok) {
        const result = await whisperRes.json();
        log("🎵 Whisper result:", result.text?.substring(0, 200));
        if (result.text) return result.text;
      } else {
        const errText = await whisperRes.text();
        logErr("🎵 Whisper error:", whisperRes.status, errText.substring(0, 200));
      }
    } catch (e: any) {
      logErr("🎵 Whisper exception:", e.message);
    }
  }

  throw new Error("no_stt_available");
}

// ─── Text-to-Speech via ElevenLabs ───
async function textToSpeech(text: string, voiceId: string): Promise<Uint8Array | null> {
  const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY_CUSTOM") || Deno.env.get("ELEVENLABS_API_KEY");
  if (!elevenLabsKey) return null;

  try {
    log("🔊 TTS generating audio for:", text.substring(0, 80));
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
      }),
    });

    if (ttsRes.ok) {
      const audioData = new Uint8Array(await ttsRes.arrayBuffer());
      log("🔊 TTS generated:", audioData.length, "bytes");
      return audioData;
    } else {
      const errText = await ttsRes.text();
      logErr("🔊 TTS error:", ttsRes.status, errText.substring(0, 200));
    }
  } catch (e: any) {
    logErr("🔊 TTS exception:", e.message);
  }
  return null;
}

// ─── Send interactive menu (buttons/list/carousel) via UAZAPI ───
async function sendMenuViaUazapi(
  wsSettings: { base_url: string; token: string },
  phone: string,
  options: {
    type: "button" | "list" | "poll" | "carousel";
    text: string;
    footerText?: string;
    choices: string[];
    title?: string;
    imageButton?: string;
    cards?: Array<{ title: string; body?: string; image?: string; choices: string[] }>;
  }
): Promise<any> {
  const baseUrl = wsSettings.base_url.replace(/\/$/, "");

  // Use dedicated /send/carousel endpoint for carousel type
  if (options.type === "carousel" && options.cards) {
    const url = baseUrl + "/send/carousel";
    const carouselPayload = {
      number: phone,
      text: options.text,
      carousel: options.cards.map((card) => ({
        text: card.title + (card.body ? "\n" + card.body : ""),
        image: card.image || undefined,
        buttons: card.choices.map((c) => {
          const parts = c.split("|");
          return {
            id: parts[1] || parts[0],
            text: parts[0],
            type: "REPLY",
          };
        }),
      })),
    };

    log("🔘 Sending carousel via UAZAPI /send/carousel:", url, "cards:", options.cards.length);
    log("🔘 Carousel payload:", JSON.stringify(carouselPayload).substring(0, 500));
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: wsSettings.token },
      body: JSON.stringify(carouselPayload),
    });
    const resText = await res.text();
    log("🔘 UAZAPI /send/carousel result:", res.status, resText.substring(0, 300));
    if (!res.ok) throw new Error(`UAZAPI carousel error ${res.status}: ${resText.substring(0, 200)}`);
    try { return JSON.parse(resText); } catch { return { raw: resText }; }
  }

  // For button/list/poll, use /send/menu
  const url = baseUrl + "/send/menu";
  const body: any = {
    number: phone,
    type: options.type,
    text: options.text,
    choices: options.choices,
  };
  if (options.footerText) body.footerText = options.footerText;
  if (options.title) body.title = options.title;
  if (options.imageButton) body.imageButton = options.imageButton;

  log("🔘 Sending menu via UAZAPI:", url, "type:", options.type, "choices:", options.choices.length);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: wsSettings.token },
    body: JSON.stringify(body),
  });
  const resText = await res.text();
  log("🔘 UAZAPI /send/menu result:", res.status, resText.substring(0, 300));
  if (!res.ok) throw new Error(`UAZAPI menu error ${res.status}: ${resText.substring(0, 200)}`);
  try { return JSON.parse(resText); } catch { return { raw: resText }; }
}

// ─── Send audio via UAZAPI ───
async function sendAudioViaUazapi(wsSettings: any, phone: string, audioData: Uint8Array): Promise<void> {
  // Upload to Supabase storage first, then send URL
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const fileName = `tts/${Date.now()}.mp3`;
  
  const { error: upErr } = await sb.storage.from("agent-files").upload(fileName, audioData, { contentType: "audio/mpeg" });
  if (upErr) {
    logErr("🔊 Upload TTS error:", upErr.message);
    return;
  }
  
  const { data: urlData } = sb.storage.from("agent-files").getPublicUrl(fileName);
  const audioUrl = urlData.publicUrl;
  log("🔊 TTS uploaded to:", audioUrl);

  // UAZAPI v2 uses unified /send/media endpoint with type field
  const baseUrl = wsSettings.base_url.replace(/\/$/, "");
  const sendUrl = baseUrl + "/send/media";
  const sendBody = { number: phone, type: "ptt", file: audioUrl, delay: 1 };
  
  log("🔊 Sending audio via /send/media (type=ptt):", sendUrl);
  const res = await fetch(sendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: wsSettings.token },
    body: JSON.stringify(sendBody),
  });
  const resText = await res.text();
  log("🔊 UAZAPI /send/media result:", res.status, resText.substring(0, 300));
  
  if (res.status !== 200 && res.status !== 201) {
    // Fallback: try type "audio" instead of "ptt"
    log("🔊 ⚠️ PTT failed, trying type=audio...");
    const res2 = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: wsSettings.token },
      body: JSON.stringify({ number: phone, type: "audio", file: audioUrl, delay: 1 }),
    });
    const resText2 = await res2.text();
    log("🔊 UAZAPI /send/media (type=audio) result:", res2.status, resText2.substring(0, 300));
  }
}

// ─── React to a message with emoji via UAZAPI ───
async function reactToMessage(wsSettings: { base_url: string; token: string }, messageId: string, emoji: string): Promise<void> {
  try {
    const url = wsSettings.base_url.replace(/\/$/, "") + "/message/react";
    log("😀 Reacting to message:", messageId, "emoji:", emoji);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: wsSettings.token },
      body: JSON.stringify({ id: messageId, reaction: emoji }),
    });
    const resText = await res.text();
    log("😀 React result:", res.status, resText.substring(0, 200));
  } catch (e: any) {
    log("😀 React error (non-fatal):", e.message);
  }
}

// ─── Handle reaction trigger (client reacted with emoji) ───
async function handleReactionTrigger(sb: any, companyId: string, phone: string, emoji: string, reactedMsgId?: string): Promise<any> {
  log("😀 handleReactionTrigger:", companyId, phone, emoji);
  
  // Get agent settings to check reaction triggers
  const { data: ag } = await sb.from("whatsapp_agent_settings")
    .select("reaction_triggers, enabled")
    .eq("company_id", companyId).single();
  
  if (!ag?.enabled) return { ok: true, skipped: "agent_disabled" };
  
  const triggers = ag.reaction_triggers || [];
  const matchedTrigger = triggers.find((t: any) => t.emoji === emoji);
  
  if (!matchedTrigger) {
    log("😀 No trigger matched for emoji:", emoji);
    return { ok: true, skipped: "no_trigger", emoji };
  }
  
  log("😀 Trigger matched! action:", matchedTrigger.action, "label:", matchedTrigger.label);
  
  const cleanPhone = phone.replace(/\D/g, "");
  const { data: ws } = await sb.from("whatsapp_settings")
    .select("base_url, instance_id, token, active")
    .eq("company_id", companyId).single();
  
  if (matchedTrigger.action === "confirm_appointment") {
    // Find the most recent pending appointment for this client
    const { data: appts } = await sb.from("appointments")
      .select("id, appointment_date, start_time, services(name)")
      .eq("company_id", companyId)
      .or(`client_phone.eq.${cleanPhone},client_phone.eq.+${cleanPhone}`)
      .eq("status", "pending")
      .order("appointment_date", { ascending: true })
      .limit(1);
    
    if (appts && appts.length > 0) {
      const appt = appts[0];
      await sb.from("appointments").update({ status: "confirmed" }).eq("id", appt.id);
      log("😀 ✅ Appointment confirmed via reaction:", appt.id);
      
      // Send confirmation message
      if (ws?.active && ws?.base_url && ws?.token) {
        const msg = `Agendamento confirmado! ✅ ${appt.services?.name || "Serviço"} em ${formatDate(appt.appointment_date)} às ${appt.start_time?.substring(0, 5)}`;
        await sendUazapiMessage(ws, cleanPhone, msg);
      }
      
      return { ok: true, action: "confirmed", appointment_id: appt.id };
    } else {
      if (ws?.active && ws?.base_url && ws?.token) {
        await sendUazapiMessage(ws, cleanPhone, "Não encontrei nenhum agendamento pendente para confirmar. 🤔");
      }
      return { ok: true, action: "no_pending_appointment" };
    }
  } else if (matchedTrigger.action === "cancel_appointment") {
    const { data: appts } = await sb.from("appointments")
      .select("id, appointment_date, start_time, services(name)")
      .eq("company_id", companyId)
      .or(`client_phone.eq.${cleanPhone},client_phone.eq.+${cleanPhone}`)
      .in("status", ["pending", "confirmed"])
      .order("appointment_date", { ascending: true })
      .limit(1);
    
    if (appts && appts.length > 0) {
      const appt = appts[0];
      await sb.from("appointments").update({ status: "canceled" }).eq("id", appt.id);
      log("😀 ❌ Appointment canceled via reaction:", appt.id);
      
      if (ws?.active && ws?.base_url && ws?.token) {
        const msg = `Agendamento cancelado. 😢 ${appt.services?.name || "Serviço"} em ${formatDate(appt.appointment_date)} foi cancelado. Deseja remarcar?`;
        await sendUazapiMessage(ws, cleanPhone, msg);
      }
      
      return { ok: true, action: "canceled", appointment_id: appt.id };
    }
    return { ok: true, action: "no_appointment_found" };
  }
  
  // Custom action - forward as a message to the agent
  log("😀 Custom action, forwarding as agent message:", matchedTrigger.label);
  const result = await handleAgent(sb, companyId, phone, `[REAÇÃO: ${emoji}] ${matchedTrigger.label || "Reagiu com " + emoji}`, {
    is_audio: false, audio_media_url: null, audio_media_key: null, audio_message_id: null,
  });
  return result;
}

// ─── Download audio from UAZAPI (try multiple endpoints) ───
async function downloadAudioFromUazapi(wsSettings: any, messageId: string, waMessageId?: string, chatId?: string): Promise<string | null> {
  if (!wsSettings?.base_url || !wsSettings?.token) return null;
  
  const baseUrl = wsSettings.base_url.replace(/\/$/, "");
  const token = wsSettings.token;
  const headers = { token };
  const headersJson = { "Content-Type": "application/json", token };

  // Helper: process response
  async function processRes(res: Response, label: string): Promise<string | null> {
    if (!res.ok) {
      const errText = await res.text();
      logErr(`🎵 ${label} error:`, res.status, errText.substring(0, 200));
      return null;
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      const url = data.url || data.link || data.mediaUrl || data.data?.url || data.data?.link || data.data?.mediaUrl;
      if (url) { log(`🎵 ${label} got URL:`, String(url).substring(0, 100)); return url; }
      if (data.base64) { return await uploadBase64ToStorage(data.base64); }
      if (data.data?.base64) { return await uploadBase64ToStorage(data.data.base64); }
      log(`🎵 ${label} JSON response but no url/base64. Keys:`, Object.keys(data).join(","));
    } else {
      const audioData = new Uint8Array(await res.arrayBuffer());
      if (audioData.length > 100) {
        log(`🎵 ${label} got binary:`, audioData.length, "bytes");
        return await uploadBinaryToStorage(audioData);
      }
    }
    return null;
  }

  // Strategy 1: GET /chat/downloadMediaMessage?messageid={id}
  if (messageId) {
    try {
      const url = `${baseUrl}/chat/downloadMediaMessage?messageid=${messageId}`;
      log("🎵 Try GET downloadMediaMessage (query):", url);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET downloadMediaMessage?messageid");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET downloadMediaMessage query exception:", e.message); }
  }

  // Strategy 2: GET /chat/downloadMediaMessage/{id}
  if (messageId) {
    try {
      const url = `${baseUrl}/chat/downloadMediaMessage/${messageId}`;
      log("🎵 Try GET downloadMediaMessage/{id}:", url);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET downloadMediaMessage/{id}");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET downloadMediaMessage/{id} exception:", e.message); }
  }

  // Strategy 3: GET /chat/getMediaLink?messageid={id}
  if (messageId) {
    try {
      const url = `${baseUrl}/chat/getMediaLink?messageid=${messageId}`;
      log("🎵 Try GET getMediaLink:", url);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET getMediaLink");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET getMediaLink exception:", e.message); }
  }

  // Strategy 4: GET /chat/getLink?messageid={id}
  if (messageId) {
    try {
      const url = `${baseUrl}/chat/getLink?messageid=${messageId}`;
      log("🎵 Try GET getLink:", url);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET getLink");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET getLink exception:", e.message); }
  }

  // Strategy 5: GET /message/downloadMedia?messageid={id}
  if (messageId) {
    try {
      const url = `${baseUrl}/message/downloadMedia?messageid=${messageId}`;
      log("🎵 Try GET message/downloadMedia:", url);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET message/downloadMedia");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET message/downloadMedia exception:", e.message); }
  }

  // Strategy 6: POST /chat/downloadMediaMessage with chatid + messageid
  if (messageId && chatId) {
    try {
      const url = `${baseUrl}/chat/downloadMediaMessage`;
      log("🎵 Try POST downloadMediaMessage with chatid:", chatId);
      const res = await fetch(url, {
        method: "POST",
        headers: headersJson,
        body: JSON.stringify({ messageid: messageId, chatid: chatId }),
      });
      const result = await processRes(res, "POST downloadMediaMessage+chatid");
      if (result) return result;
    } catch (e: any) { logErr("🎵 POST downloadMediaMessage+chatid exception:", e.message); }
  }

  // Strategy 7: Try with WhatsApp message ID
  if (waMessageId && waMessageId !== messageId) {
    try {
      const url = `${baseUrl}/chat/downloadMediaMessage?messageid=${encodeURIComponent(waMessageId)}`;
      log("🎵 Try GET downloadMediaMessage with wa_id:", waMessageId);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET downloadMediaMessage wa_id");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET downloadMediaMessage wa_id exception:", e.message); }
  }

  log("🎵 All download strategies failed for messageid:", messageId, "wa_id:", waMessageId, "chatid:", chatId);
  return null;
}

async function uploadBase64ToStorage(base64Data: string): Promise<string> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const path = `audio-incoming/${Date.now()}.ogg`;
  await sb.storage.from("agent-files").upload(path, binaryData, { contentType: "audio/ogg" });
  const { data: urlData } = sb.storage.from("agent-files").getPublicUrl(path);
  log("🎵 Uploaded base64 audio to storage:", urlData.publicUrl);
  return urlData.publicUrl;
}

async function uploadBinaryToStorage(audioData: Uint8Array): Promise<string> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const path = `audio-incoming/${Date.now()}.ogg`;
  await sb.storage.from("agent-files").upload(path, audioData, { contentType: "audio/ogg" });
  const { data: urlData } = sb.storage.from("agent-files").getPublicUrl(path);
  log("🎵 Uploaded binary audio to storage:", urlData.publicUrl);
  return urlData.publicUrl;
}

// ─── Analyze image or PDF using a vision model ───
async function analyzeMedia(
  mediaUrl: string,
  mediaType: "image" | "document",
  mimeType: string,
  caption: string | null,
  visionModel: string,
  apiKey: string,
  apiUrl: string,
  mediaKey?: string | null,
): Promise<string> {
  log("🔍 analyzeMedia START type:", mediaType, "mimeType:", mimeType, "model:", visionModel);

  // Download the media
  let rawData: Uint8Array;
  try {
    const res = await fetch(mediaUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    rawData = new Uint8Array(await res.arrayBuffer());
    log("🔍 Media downloaded:", rawData.length, "bytes");
  } catch (e: any) {
    logErr("🔍 Media download error:", e.message);
    throw new Error("media_download_failed: " + e.message);
  }

  // Decrypt if this is a WhatsApp encrypted media (has media_key and URL ends in .enc or is mmg.whatsapp.net)
  let mediaData = rawData;
  const isWhatsAppEncrypted = mediaKey && (mediaUrl.includes("mmg.whatsapp.net") || mediaUrl.includes(".enc"));
  if (isWhatsAppEncrypted) {
    try {
      log("🔍 Decrypting WhatsApp media with media_key...");
      mediaData = await decryptWhatsAppMedia(rawData, mediaKey, mediaType);
      log("🔍 Decrypted successfully:", mediaData.length, "bytes");
    } catch (e: any) {
      logErr("🔍 Decryption failed, trying raw data:", e.message);
      // Fall back to raw data — maybe the API can handle it
      mediaData = rawData;
    }
  }

  // Convert to base64 (chunked to avoid call stack overflow for large files)
  let base64Data = "";
  const chunkSize = 8192;
  for (let i = 0; i < mediaData.length; i += chunkSize) {
    base64Data += String.fromCharCode(...mediaData.slice(i, i + chunkSize));
  }
  base64Data = btoa(base64Data);
  const dataUri = `data:${mimeType};base64,${base64Data}`;

  // Build the prompt with strict objective analysis instructions
  const captionContext = caption ? ` com a legenda: "${caption}"` : "";
  const analysisPrompt = `Analise objetivamente o conteúdo desta ${mediaType === "image" ? "imagem" : "documento PDF"}${captionContext} enviada por um cliente de um estabelecimento.

INSTRUÇÕES CRÍTICAS DE ANÁLISE:
1. Descreva EXATAMENTE o que você vê/lê, de forma objetiva e detalhada em português.
2. Classifique o tipo de conteúdo de forma EXPLÍCITA. Use uma destas classificações:
   - COMPROVANTE_PAGAMENTO: apenas se claramente identificar banco, valor, data, chave/destinatário E número de transação visíveis
   - DOCUMENTO_MEDICO: laudo, exame, receita, prescrição médica
   - FOTO_REFERENCIA: foto de estilo, look, referência para serviço
   - DOCUMENTO_GERAL: contrato, orçamento, nota fiscal, outro documento
   - FOTO_GERAL: foto pessoal, de local, produto, ou imagem genérica
   - PDF_GERAL: documento PDF sem categoria específica
3. NUNCA classifique como COMPROVANTE_PAGAMENTO se não estiver 100% claro. Na dúvida, classifique como FOTO_GERAL ou DOCUMENTO_GERAL.
4. Liste todos os textos/números legíveis que encontrar.
5. Se for identificado como possível comprovante, extraia: banco emissor, valor, data/hora, destinatário/chave, ID da transação.

Responda no formato:
TIPO: [classificação]
CONTEÚDO: [descrição objetiva do que é visível]
TEXTOS_LEGÍVEIS: [todos os textos/números identificados]
OBSERVAÇÕES: [outras informações relevantes ou dúvidas sobre a classificação]`;

  // Build multimodal message
  const content: any[] = [
    { type: "text", text: analysisPrompt },
  ];

  if (mediaType === "image") {
    content.push({ type: "image_url", image_url: { url: dataUri } });
  } else {
    // For PDFs, Gemini supports document type; for others use image_url with mime_type
    content.push({ type: "image_url", image_url: { url: dataUri } });
  }

  // For Gemini models going directly to Google API, strip the "google/" prefix
  const resolvedVisionModel = (apiUrl.includes("generativelanguage.googleapis.com") && visionModel.startsWith("google/"))
    ? visionModel.replace("google/", "")
    : visionModel;

  // New OpenAI models (gpt-5*) don't support temperature
  const visionModelIsNewOpenAI = resolvedVisionModel.includes("gpt-5") || resolvedVisionModel.includes("o1") || resolvedVisionModel.includes("o3");

  const requestBody: any = {
    model: resolvedVisionModel,
    messages: [{ role: "user", content }],
    max_tokens: 1500,
    ...(visionModelIsNewOpenAI ? {} : { temperature: 0.1 }),
  };

  log("🔍 Calling vision model:", visionModel, "via:", apiUrl);
  const aiRes = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    logErr("🔍 Vision API error:", aiRes.status, errText.substring(0, 300));
    throw new Error(`vision_api_error: ${aiRes.status}`);
  }

  const aiData = await aiRes.json();
  const analysis = aiData.choices?.[0]?.message?.content?.trim() || "";
  log("🔍 Vision analysis result (first 400):", analysis.substring(0, 400));
  return analysis;
}

// ─── Auto-register atendimento (complaint/issue detection) ───
// Keywords that suggest a complaint or issue (not scheduling)
const COMPLAINT_KEYWORDS = /\b(reclamação|reclamacao|reclamar|reclamando|problema|problemas|defeito|defeituoso|quebrado|estragou|estragado|não funcionou|nao funcionou|insatisfeito|insatisfação|insatisfacao|ruim|péssimo|pessimo|horrível|horrible|horroroso|errado|errou|errei|cobrança errada|cobranca errada|cobraram|cobrança indevida|cobrança a mais|cobrar|reembolso|devolver|devolutiva|devolução|devolucao|não recebi|nao recebi|atrasou|atrasada|atrasado|entrega|demora|demorou|demorando|fui mal atendido|mal atendido|mau atendimento|sem resposta|não responderam|nao responderam|não resolveu|nao resolveu|produto errado|produto danificado|danificado|danificou|arranhado|sujo|estragado|faltou|faltando|incompleto|incompleta|lojista|gerente|responsável|responsavel|quero falar com|falar com alguém|falar com alguem|quero reclamar|quero registrar|registrar ocorrência|registrar ocorrencia|ocorrência|ocorrencia)\b/i;

/**
 * Instead of registering immediately, mark the conversation as having a pending
 * complaint. The `process-complaints` edge function will run every 5 minutes,
 * detect conversations inactive for 10+ minutes and register the full atendimento
 * with the complete conversation history for maximum detail.
 */
async function markComplaintPending(
  sb: any,
  conversationId: string,
  message: string,
): Promise<void> {
  if (!COMPLAINT_KEYWORDS.test(message)) return;

  // Only mark if not already pending/registered today
  const { data: conv } = await sb
    .from("whatsapp_conversations")
    .select("current_intent")
    .eq("id", conversationId)
    .maybeSingle();

  if (conv?.current_intent === "complaint_pending") {
    log("📋 Complaint already marked as pending for this conversation — skip");
    return;
  }

  await sb
    .from("whatsapp_conversations")
    .update({ current_intent: "complaint_pending" })
    .eq("id", conversationId);

  log("📋 ✅ Conversation marked as complaint_pending — will be registered after 10 min of inactivity");
}

// ─── AI Agent Logic ───
const DN = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

interface AudioParams {
  is_audio: boolean;
  audio_media_url: string | null;
  audio_media_key: string | null;
  audio_message_id: string | null;
  audio_wa_msg_id?: string | null;
  audio_chat_id?: string | null;
  wa_message_id?: string | null;
  // Media (image / document)
  is_media?: boolean;
  media_type?: "image" | "document" | null;
  media_url?: string | null;
  media_key?: string | null;
  media_message_id?: string | null;
  media_mime_type?: string | null;
  media_caption?: string | null;
}

async function handleAgent(
  sb: any,
  cid: string,
  phone: string,
  msg: string,
  audioParams: AudioParams = { is_audio: false, audio_media_url: null, audio_media_key: null, audio_message_id: null },
  agentOptions: { skipIncomingSave?: boolean; existingConvId?: string; _lockMsgId?: string; instanceId?: string | null } = {}
): Promise<any> {
  log("🤖 handleAgent START cid:", cid, "phone:", phone, "msg:", msg.substring(0, 100), "is_audio:", audioParams.is_audio, "instanceId:", agentOptions.instanceId || "none");

  if (!cid || !phone || !msg) {
    log("🤖 ❌ Missing fields");
    return { error: "missing fields" };
  }

  // Check agent settings — prefer instance-specific settings, fall back to company default (null instance_id)
  log("🤖 Fetching agent settings...");
  let ag: any = null;
  let agErr: any = null;

  // Try instance-specific settings first
  if (agentOptions.instanceId) {
    const { data: instAg, error: instErr } = await sb
      .from("whatsapp_agent_settings")
      .select("*")
      .eq("company_id", cid)
      .eq("instance_id", agentOptions.instanceId)
      .maybeSingle();
    if (instAg) {
      ag = instAg;
      log("🤖 Using instance-specific agent settings for instance:", agentOptions.instanceId);
    } else {
      agErr = instErr;
      log("🤖 No instance-specific settings found, falling back to company default");
    }
  }

  // Fall back to company-level default (instance_id IS NULL)
  if (!ag) {
    const { data: compAg, error: compErr } = await sb
      .from("whatsapp_agent_settings")
      .select("*")
      .eq("company_id", cid)
      .is("instance_id", null)
      .maybeSingle();
    ag = compAg;
    agErr = compErr;
  }

  log("🤖 Agent settings:", ag ? `enabled=${ag.enabled}` : "NOT FOUND", "error:", agErr?.message);
  if (!ag?.enabled) {
    log("🤖 Agent is DISABLED, skipping");
    return { ok: true, skipped: "agent_disabled" };
  }

  // Get/create conversation — if agentOptions.existingConvId provided, use it directly
  let conv: any = null;
  if (agentOptions.existingConvId) {
    log("🤖 Using pre-existing conv from delay buffer:", agentOptions.existingConvId);
    const { data: existingByIdConv } = await sb.from("whatsapp_conversations").select("*").eq("id", agentOptions.existingConvId).single();
    conv = existingByIdConv;
  }

  if (!conv) {
    log("🤖 Looking for active conversation...");
    let convQuery = sb
      .from("whatsapp_conversations")
      .select("*")
      .eq("company_id", cid)
      .eq("phone", phone)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);

    // Scope conversation to this specific instance
    if (agentOptions.instanceId) {
      convQuery = convQuery.eq("instance_id", agentOptions.instanceId);
    } else {
      convQuery = convQuery.is("instance_id", null);
    }

    const { data: foundConv, error: convErr } = await convQuery.single();
    log("🤖 Existing conv:", foundConv?.id || "NONE", "error:", convErr?.message);
    conv = foundConv;
  }

  if (!conv) {
    log("🤖 Creating new conversation...");
    const newConvData: any = { company_id: cid, phone, status: "active" };
    if (agentOptions.instanceId) newConvData.instance_id = agentOptions.instanceId;
    const { data: nc, error: ncErr } = await sb.from("whatsapp_conversations").insert(newConvData).select().single();
    conv = nc;
    log("🤖 New conv:", nc?.id || "FAILED", "error:", ncErr?.message);
  }
  if (!conv) {
    logErr("🤖 ❌ Conv creation failed!");
    return { error: "conv_fail" };
  }

  if (conv.handoff_requested) {
    log("🤖 Handoff active, skipping");
    return { ok: true, skipped: "handoff" };
  }

  // ── wa_message_id deduplication (second gate, after conversation is resolved) ──
  // The webhook already did a global check, but if the same wa_message_id somehow
  // sneaks through (e.g. concurrent requests that passed the first gate simultaneously),
  // we catch it here at the conversation level.
  const incomingWaId: string | null = audioParams.wa_message_id || null;
  if (!agentOptions.skipIncomingSave && incomingWaId) {
    const { data: existingByWaId } = await sb.from("whatsapp_messages")
      .select("id")
      .eq("conversation_id", conv.id)
      .eq("wa_message_id", incomingWaId)
      .eq("direction", "incoming")
      .limit(1)
      .maybeSingle();

    if (existingByWaId) {
      log("🤖 ⚠️ wa_message_id already processed:", incomingWaId, "→ skipping duplicate");
      return { ok: true, skipped: "duplicate_wa_id", conversation_id: conv.id, wa_message_id: incomingWaId };
    }
  }

  // ── Concurrency lock: prevent parallel executions for the same conversation ──
  // This is the primary guard when debounce is disabled. It checks for an active
  // 'processing' lock row within the last 60s. Only ONE call proceeds at a time.
  if (!agentOptions.skipIncomingSave) {
    const lockWindowStart = new Date(Date.now() - 60000).toISOString();
    const { data: recentOutgoing } = await sb.from("whatsapp_messages")
      .select("id, created_at, metadata")
      .eq("conversation_id", conv.id)
      .eq("direction", "outgoing")
      .eq("delivery_status", "processing")
      .gte("created_at", lockWindowStart)
      .limit(1);

    if (recentOutgoing && recentOutgoing.length > 0) {
      log("🤖 ⚠️ CONCURRENT PROCESSING LOCK: another call is already handling this conversation. Skipping.", "lock_id:", recentOutgoing[0].id);
      return { ok: true, skipped: "concurrent_lock", conversation_id: conv.id };
    }

    // Acquire lock: insert a processing placeholder message immediately
    // Store wa_message_id in metadata so we can trace which message triggered this lock
    const { data: lockMsg, error: lockInsertErr } = await sb.from("whatsapp_messages").insert({
      conversation_id: conv.id,
      company_id: cid,
      direction: "outgoing",
      message_type: "text",
      content: "__PROCESSING__",
      delivery_status: "processing",
      metadata: { lock: true, triggered_by_wa_id: incomingWaId },
    }).select("id").single();

    if (lockInsertErr) {
      log("🤖 ⚠️ Lock insert failed (possible race condition), skipping:", lockInsertErr.message);
      return { ok: true, skipped: "lock_insert_failed", conversation_id: conv.id };
    }

    // Register cleanup at end of execution
    if (lockMsg?.id) {
      agentOptions._lockMsgId = lockMsg.id;
      log("🔒 Processing lock acquired. lockMsgId:", lockMsg.id, "triggered_by_wa_id:", incomingWaId);
    }
  }

  // ── Fallback content-based deduplication (for messages without wa_message_id) ──
  // Only runs if we don't have a wa_message_id, as the ID-based check above is preferred.
  if (!agentOptions.skipIncomingSave && !incomingWaId) {
    const fifteenSecsAgo = new Date(Date.now() - 15000).toISOString();
    const { data: recentDups } = await sb.from("whatsapp_messages")
      .select("id")
      .eq("conversation_id", conv.id)
      .eq("direction", "incoming")
      .eq("content", msg)
      .eq("delivery_status", "read")
      .gte("created_at", fifteenSecsAgo)
      .limit(1);

    if (recentDups && recentDups.length > 0) {
      log("🤖 ⚠️ Content-based DUPLICATE detected, skipping. Existing msg:", recentDups[0].id);
      if (agentOptions._lockMsgId) {
        try { await sb.from("whatsapp_messages").delete().eq("id", agentOptions._lockMsgId); } catch {}
      }
      return { ok: true, skipped: "duplicate_content", conversation_id: conv.id };
    }
  }



  // ── Audio transcription: convert audio to text ──
  let actualMsg = msg;
  let isAudioMsg = audioParams.is_audio;
  
  if (isAudioMsg) {
    log("🎵 Audio message detected, attempting transcription...");
    
    // Fetch WS settings to download media from UAZAPI (use instance-specific credentials)
    const wsForAudio = await getWsCredentials(sb, cid, agentOptions.instanceId);
    
    let audioUrl = audioParams.audio_media_url;
    
    // If no direct URL, try downloading from UAZAPI
    if (!audioUrl && audioParams.audio_message_id && wsForAudio) {
      audioUrl = await downloadAudioFromUazapi(wsForAudio, audioParams.audio_message_id, audioParams.audio_wa_msg_id || undefined, audioParams.audio_chat_id || undefined);
    }
    
    if (audioUrl) {
      try {
        actualMsg = await transcribeAudio(audioUrl, wsForAudio, audioParams.audio_media_key);
        log("🎵 Transcribed audio:", actualMsg.substring(0, 150));
      } catch (e: any) {
        logErr("🎵 Transcription failed:", e.message);
        actualMsg = "[O cliente enviou um áudio que não pôde ser transcrito]";
      }
    } else {
      log("🎵 No audio URL available, cannot transcribe");
      actualMsg = "[O cliente enviou um áudio mas não foi possível obter o arquivo]";
    }
  }

  // ── Media analysis: analyze image or document if feature is enabled ──
  let mediaAnalysis: string | null = null;
  if (audioParams.is_media && audioParams.media_url && audioParams.media_type) {
    if (ag?.can_read_media) {
      log("🔍 Media message detected, attempting analysis...");
      const visionModel = ag?.media_vision_model || "google/gemini-3-flash-preview";

      // Determine API endpoint and key for vision model
      let visionApiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      let visionApiKey = Deno.env.get("LOVABLE_API_KEY");

      // Route vision model to the correct provider based on model family
      // A Gemini model must NEVER go to the OpenAI endpoint and vice-versa
      const preferredProvider = ag?.preferred_provider || "lovable";
      const visionModelIsGemini = visionModel.startsWith("google/") || visionModel.startsWith("gemini-");
      const visionModelIsOpenAI = !visionModelIsGemini;

      if (visionModelIsOpenAI && preferredProvider === "openai" && ag?.openai_api_key) {
        // OpenAI model + tenant has OpenAI key → use OpenAI directly
        visionApiUrl = "https://api.openai.com/v1/chat/completions";
        visionApiKey = ag.openai_api_key;
      } else if (visionModelIsGemini && preferredProvider === "gemini" && ag?.gemini_api_key) {
        // Gemini model + tenant has Gemini key → use Google directly
        visionApiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
        visionApiKey = ag.gemini_api_key;
      } else {
        // Fallback: always use Lovable gateway (supports both Google and OpenAI models)
        visionApiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
        visionApiKey = Deno.env.get("LOVABLE_API_KEY");
        log("🔍 Vision routing via Lovable gateway (cross-provider or no dedicated key)");
      }

      if (visionApiKey) {
        try {
          mediaAnalysis = await analyzeMedia(
            audioParams.media_url,
            audioParams.media_type,
            audioParams.media_mime_type || (audioParams.media_type === "image" ? "image/jpeg" : "application/pdf"),
            audioParams.media_caption || null,
            visionModel,
            visionApiKey,
            visionApiUrl,
            audioParams.media_key || null,
          );

          const mediaLabel = audioParams.media_type === "image" ? "imagem" : "documento PDF";
          const captionInfo = audioParams.media_caption ? ` com legenda: "${audioParams.media_caption}"` : "";
          actualMsg = `[O cliente enviou ${mediaLabel}${captionInfo}]\n\nCONTEÚDO ANALISADO:\n${mediaAnalysis}\n\n${msg && msg !== `[${audioParams.media_type === "image" ? "imagem" : "documento"}]` ? `Mensagem adicional do cliente: ${msg}` : ""}`.trim();
          log("🔍 Media analysis injected into message context");
        } catch (e: any) {
          logErr("🔍 Media analysis failed:", e.message);
          const mediaLabel = audioParams.media_type === "image" ? "imagem" : "documento PDF";
          actualMsg = `[O cliente enviou ${audioParams.media_caption ? `${mediaLabel}: "${audioParams.media_caption}"` : `uma ${mediaLabel}`} que não pôde ser analisada]`;
        }
      } else {
        log("🔍 No API key available for vision model, skipping analysis");
        const mediaLabel = audioParams.media_type === "image" ? "imagem" : "documento";
        actualMsg = `[O cliente enviou ${audioParams.media_caption ? `uma ${mediaLabel}: "${audioParams.media_caption}"` : `uma ${mediaLabel}`}]`;
      }
    } else {
      // Feature disabled — explicitly warn the agent it CANNOT read the image
      const mediaLabel = audioParams.media_type === "image" ? "imagem" : "documento";
      const captionNote = audioParams.media_caption ? ` com legenda: "${audioParams.media_caption}"` : "";
      actualMsg = `[SISTEMA: O cliente enviou uma ${mediaLabel}${captionNote}. LEITURA DE MÍDIA ESTÁ DESABILITADA — você NÃO tem acesso ao conteúdo desta ${mediaLabel}. NÃO presuma o que é. NÃO confirme pagamento. NÃO assuma que é comprovante. Informe ao cliente que no momento não consegue visualizar ${mediaLabel === "imagem" ? "imagens" : "documentos"} e peça para descrever o que precisa.]`;
      log("🔍 can_read_media is disabled, skipping analysis");
    }
  }

  // Save incoming message — SKIP if skipIncomingSave (messages already saved during delay buffering)
  if (!agentOptions.skipIncomingSave) {
    log("🤖 Saving incoming message...");
    const messageType = audioParams.is_media && audioParams.media_type ? audioParams.media_type : (isAudioMsg ? "audio" : "text");
    const incomingInsert: any = {
      conversation_id: conv.id, company_id: cid, direction: "incoming",
      message_type: messageType,
      content: actualMsg,
      delivery_status: "read",
      metadata: isAudioMsg
        ? { original_type: "audio", transcribed: actualMsg !== msg }
        : (audioParams.is_media ? { original_type: audioParams.media_type, analyzed: !!mediaAnalysis, caption: audioParams.media_caption } : {})
    };
    // wa_message_id passed from wa-webhook for reaction/tracking support
    if (audioParams.wa_message_id) incomingInsert.wa_message_id = audioParams.wa_message_id;
    const { error: msgErr } = await sb.from("whatsapp_messages").insert(incomingInsert);
    log("🤖 Message saved:", msgErr ? `ERROR: ${msgErr.message}` : "OK");
  } else {
    log("🤖 Skipping incoming save — messages already buffered in DB (skipIncomingSave=true)");
  }

  await sb.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

  // Load context
  log("🤖 Loading context... instanceId:", agentOptions.instanceId || "company-default");
  const t1 = Date.now();
  const ctx = await loadCtx(sb, cid, phone, conv.id, agentOptions.instanceId);
  log("🤖 Context loaded in", Date.now() - t1, "ms. msgs:", ctx.msgs.length, "appts:", ctx.appts.length, "svcs:", ctx.svcs.length, "kb:", ctx.kb.length);

  // Call AI
  log("🤖 Calling AI...");
  const t2 = Date.now();
  try {
    let reply = await callAI(sb, cid, conv, ctx, actualMsg, { isAudioMsg, agentSettings: ag, instanceId: agentOptions.instanceId });
    // Normalize times in reply for natural PT-BR speech
    if (reply !== "__MENU_SENT__") reply = normalizeTimeForSpeech(reply);
    log("🤖 AI reply in", Date.now() - t2, "ms:", reply.substring(0, 150));

    // Auto-send services as interactive menu when scheduling intent is detected
    // and the AI didn't already send a menu (no tool calls for buttons/list)
    if (reply !== "__MENU_SENT__" && (ctx.svcs || []).length > 0) {
      const schedulingKeywords = /\b(agendar|marcar|reservar|horário|horario|appointment|schedule|quero.*hora|quero.*serviço|quero.*servico|gostaria.*agendar|preciso.*agendar|serviços|servicos|serviço|servico|quais.*serviço|quais.*servico|tem.*serviço|tem.*servico|cardápio|menu|opções|opcoes|o que vocês fazem|o que voces fazem|atendimento|procedimento|tratamento)\b/i;
      const isSchedulingIntent = schedulingKeywords.test(actualMsg);
      
      if (isSchedulingIntent) {
        log("🔘 Scheduling intent detected, auto-sending services menu...");
        const ws = await getWsCredentials(sb, cid, agentOptions.instanceId);
        if (ws?.active && ws?.base_url && ws?.token) {
          try {
            const svcs = ctx.svcs;
            // First send the AI text reply (as audio if applicable), then follow up with the services menu
            const cleanPhone = phone.replace(/\D/g, "");
            
            // Check if we should respond with audio
            let sentAsAudio = false;
            if (isAudioMsg && ag?.respond_audio_with_audio && ag?.elevenlabs_voice_id) {
              log("🔊 Scheduling flow: Responding with audio before menu...");
              try {
                const ttsText = normalizeTimeForSpeech(reply);
                const audioData = await textToSpeech(ttsText, ag.elevenlabs_voice_id);
                if (audioData) {
                  await sendAudioViaUazapi(ws, cleanPhone, audioData);
                  sentAsAudio = true;
                  log("🔊 ✅ Audio response sent before services menu!");
                }
              } catch (e: any) {
                logErr("🔊 Audio response failed in scheduling flow, falling back to text:", e.message);
              }
            }
            
            if (!sentAsAudio) {
              await sendHumanizedReply(
                { base_url: ws.base_url, instance_id: ws.instance_id || "", token: ws.token },
                cleanPhone, reply
              );
            }
            log("🔘 Reply sent before services menu (audio:", sentAsAudio, ")");

            // Now send the services menu
            const headerText = "Escolha o serviço que deseja agendar: 👇";
            const hasImages = svcs.some((s: any) => s.image_url);
            
            if (hasImages) {
              // Use carousel when services have images
              const cards = svcs.slice(0, 10).map((s: any) => {
                // Ensure image URL is clean and properly encoded
                let imgUrl = s.image_url || undefined;
                if (imgUrl) {
                  // Decode any double-encoding, then re-encode properly
                  try {
                    const urlObj = new URL(imgUrl);
                    imgUrl = urlObj.href; // normalized URL
                  } catch { /* keep original */ }
                }
                log("🔘 Card image URL for", s.name, ":", imgUrl);
                return {
                  title: s.name,
                  body: `${s.duration}min${s.price ? ' - R$' + s.price : ''}${s.description ? '\n' + s.description.substring(0, 60) : ''}`,
                  image: imgUrl,
                  choices: [`Agendar|svc_${s.id.substring(0, 8)}`],
                };
              });
              await sendMenuViaUazapi(
                { base_url: ws.base_url, token: ws.token },
                cleanPhone,
                { type: "carousel", text: headerText, choices: [], cards }
              );
              log("🔘 ✅ Services sent as carousel:", cards.length);
            } else if (svcs.length <= 3) {
              const choices = svcs.map((s: any) => `${s.name}|svc_${s.id.substring(0, 8)}`);
              await sendMenuViaUazapi(
                { base_url: ws.base_url, token: ws.token },
                cleanPhone,
                { type: "button", text: headerText, choices, footerText: svcs.some((s: any) => s.price) ? svcs.map((s: any) => `${s.name}: R$${s.price || '?'}`).join(" | ") : undefined }
              );
              log("🔘 ✅ Services sent as buttons:", svcs.length);
            } else {
              const choices = svcs.map((s: any) => `${s.name}|${s.duration}min${s.price ? ' - R$' + s.price : ''}`);
              await sendMenuViaUazapi(
                { base_url: ws.base_url, token: ws.token },
                cleanPhone,
                { type: "list", text: headerText, choices, title: "Ver serviços", footerText: `${svcs.length} serviços disponíveis` }
              );
              log("🔘 ✅ Services sent as list:", svcs.length);
            }
            // Mark as menu sent — text was already sent above, skip double send
            reply = "__MENU_SENT__";
          } catch (e: any) {
            logErr("🔘 ❌ Auto services menu failed:", e.message);
            // Don't change reply — let it send as normal text
          }
        }
      }
    }

    // Check if reply is a menu marker (buttons/list already sent via /send/menu)
    const menuAlreadySent = reply === "__MENU_SENT__";
    // Save with a system note that won't be mimicked by the AI
    const displayReply = menuAlreadySent ? "(sistema: menu interativo enviado ao cliente)" : reply;

    // ── Outgoing deduplication: two-layer fallback (hash + token similarity) ──
    const deduplicateOutgoing = ag?.deduplicate_outgoing !== false; // default true
    if (deduplicateOutgoing && !menuAlreadySent) {
      // Layer 1: SHA-256 hash of normalized content (exact duplicate)
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
      const replyNorm = normalize(displayReply);

      async function sha256hex(text: string): Promise<string> {
        const encoded = new TextEncoder().encode(text);
        const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
        return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
      }

      // Token-based similarity: Jaccard coefficient on word n-grams
      function tokenSimilarity(a: string, b: string): number {
        const tokens = (s: string) => new Set(s.split(/\s+/).filter(w => w.length > 2));
        const setA = tokens(a);
        const setB = tokens(b);
        if (setA.size === 0 || setB.size === 0) return 0;
        const intersection = new Set([...setA].filter(t => setB.has(t)));
        const union = new Set([...setA, ...setB]);
        return intersection.size / union.size;
      }

      const replyHash = await sha256hex(replyNorm);
      log("🔍 Dedup hash:", replyHash.substring(0, 16), "| len:", displayReply.length);

      const sixtySecsAgo = new Date(Date.now() - 60000).toISOString();
      const { data: recentOutgoing } = await sb.from("whatsapp_messages")
        .select("content, metadata")
        .eq("conversation_id", conv.id)
        .eq("direction", "outgoing")
        .eq("delivery_status", "sent")
        .gte("created_at", sixtySecsAgo)
        .order("created_at", { ascending: false })
        .limit(5);

      if (recentOutgoing && recentOutgoing.length > 0) {
        let isDuplicate = false;
        let dupReason = "";

        for (const r of recentOutgoing as any[]) {
          if (!r.content) continue;
          const storedHash = r.metadata?.content_hash as string | undefined;
          const recNorm = normalize(r.content);

          // Layer 1: SHA-256 exact match (via stored hash or recomputed)
          const hashToCompare = storedHash || await sha256hex(recNorm);
          if (hashToCompare === replyHash) {
            isDuplicate = true;
            dupReason = "sha256_exact";
            break;
          }

          // Layer 2: Token Jaccard similarity ≥ 85% (near-duplicate)
          if (replyNorm.length > 40 && recNorm.length > 40) {
            const sim = tokenSimilarity(replyNorm, recNorm);
            if (sim >= 0.85) {
              isDuplicate = true;
              dupReason = `jaccard_${Math.round(sim * 100)}pct`;
              break;
            }
          }
        }

        if (isDuplicate) {
          log("🤖 ⚠️ OUTGOING DUPLICATE blocked [" + dupReason + "] — skipping send.");
          if (agentOptions._lockMsgId) {
            try { await sb.from("whatsapp_messages").delete().eq("id", agentOptions._lockMsgId); } catch (_) {}
          }
          return { ok: true, skipped: "outgoing_duplicate", reason: dupReason, conversation_id: conv.id };
        }
      }

      // Store hash in metadata so future checks can skip recomputing
      agentOptions._contentHash = replyHash;
    }

    // Save outgoing message — if we have a lock placeholder, update it in place; otherwise insert new
    const outMeta: Record<string, any> = {};
    if (agentOptions._contentHash) outMeta.content_hash = agentOptions._contentHash;

    if (agentOptions._lockMsgId) {
      await sb.from("whatsapp_messages")
        .update({
          content: displayReply,
          message_type: menuAlreadySent ? "interactive" : "text",
          delivery_status: "sent",
          metadata: outMeta,
        })
        .eq("id", agentOptions._lockMsgId);
      log("🤖 Outgoing msg updated from lock placeholder:", agentOptions._lockMsgId);
    } else {
      const { error: outErr } = await sb.from("whatsapp_messages").insert({
        conversation_id: conv.id,
        company_id: cid,
        direction: "outgoing",
        message_type: menuAlreadySent ? "interactive" : "text",
        content: displayReply,
        delivery_status: "sent",
        metadata: outMeta,
      });
      log("🤖 Outgoing msg saved:", outErr ? `ERROR: ${outErr.message}` : "OK");
    }

    // Send via UAZAPI (skip if menu was already sent)
    if (menuAlreadySent) {
      log("🤖 ✅ Menu already sent via /send/menu, skipping text send");
      // If incoming was audio and audio response is enabled, send a natural TTS intro
      if (isAudioMsg && ag?.respond_audio_with_audio && ag?.elevenlabs_voice_id) {
        try {
          const ws = await getWsCredentials(sb, cid, agentOptions.instanceId);
          if (ws?.active && ws?.base_url && ws?.token) {
            const ttsIntro = "Tá aqui pra você escolher! Te mandei as opções aí.";
            log("🔊 Sending TTS audio for menu context...");
            const audioData = await textToSpeech(ttsIntro, ag.elevenlabs_voice_id);
            if (audioData) {
              await sendAudioViaUazapi(ws, phone.replace(/\D/g, ""), audioData);
              log("🔊 ✅ Audio intro sent for menu!");
            }
          }
        } catch (e: any) {
          logErr("🔊 Audio intro for menu failed:", e.message);
        }
      }
    } else {
      log("🤖 Fetching WhatsApp settings to send reply...");
      const ws = await getWsCredentials(sb, cid, agentOptions.instanceId);
      log("🤖 WS settings:", ws ? `active=${ws.active} base_url=${ws.base_url}` : "NOT FOUND");

      if (ws?.active && ws?.base_url && ws?.token) {
        const cleanPhone = phone.replace(/\D/g, "");
        const caps = ctx?.caps || {};

        // ── PIX key handling ──
        // pixKey is the configured key; pixSendAsText means "send as card, not inline"
        const pixKey = caps.pix_key || ag?.pix_key || null;
        const pixSendAsText = caps.pix_send_as_text ?? ag?.pix_send_as_text ?? true;
        const replyContainsPix = pixKey && reply.includes(pixKey);

        // Helper: detect PIX key type for display label
        const detectPixType = (key: string): string => {
          if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(key)) return "📧 E-mail";
          if (/^\d{11}$/.test(key.replace(/\D/g, ''))) return "📱 CPF";
          if (/^\d{14}$/.test(key.replace(/\D/g, ''))) return "🏢 CNPJ";
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "🔑 Chave aleatória";
          if (/^\+?\d{10,15}$/.test(key.replace(/\D/g, ''))) return "📞 Telefone";
          return "🔑 Chave PIX";
        };

        // ── STEP 1: Always strip the PIX key from the text that goes to TTS or text reply ──
        // This must happen REGARDLESS of deduplication — the key must NEVER be read aloud
        let audioReply = reply;
        if (pixKey && replyContainsPix) {
          const escapedPixKey = pixKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const safeAudioPhrase = "os dados de pagamento foram enviados em mensagem separada";

          audioReply = reply
            // Pass 1: "Chave PIX: <key>" pattern (with optional bold markers)
            .replace(new RegExp(`\\*?(?:chave\\s+pix|pix)[\\s:é*]+${escapedPixKey}\\*?`, 'gi'), safeAudioPhrase)
            // Pass 2: any remaining literal key occurrence
            .replace(new RegExp(escapedPixKey, 'gi'), '')
            // Pass 3: orphan "pix:" or "pix_key:" labels left after removal
            .replace(/pix[_\s]*(?:key)?[:\s]+/gi, '')
            // Pass 4: collapse extra spaces and blank lines
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          // Final safety net — if key is still present somehow, blast it
          if (audioReply.includes(pixKey)) {
            audioReply = audioReply.split(pixKey).join(safeAudioPhrase);
            log("💳 ⚠️ PIX key survived multi-pass strip — applied emergency replacement");
          }
          log("💳 PIX key stripped from audioReply (TTS-safe)");
        }

        // ── STEP 2: Build the PIX card — only send if not recently sent ──
        let pixTextMessage: string | null = null;
        if (replyContainsPix && pixSendAsText) {
          // Deduplication: skip card ONLY if the actual PIX card header was sent recently.
          // IMPORTANT: We must NOT match against the AI's conversational reply (which also
          // contains the key) — otherwise the card is forever skipped. We use the unique
          // card header text as the marker, since that only appears in card messages.
          let pixAlreadySentRecently = false;
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: recentPixCard } = await sb.from("whatsapp_messages")
            .select("id")
            .eq("conversation_id", conv.id)
            .eq("direction", "outgoing")
            .gte("created_at", fiveMinutesAgo)
            .ilike("content", "%DADOS PARA PAGAMENTO VIA PIX%")
            .limit(1);
          if (recentPixCard && recentPixCard.length > 0) {
            pixAlreadySentRecently = true;
            log("💳 PIX card already sent in last 5 minutes — skipping duplicate card");
          }


          if (!pixAlreadySentRecently) {
            const pixName = caps.pix_name || ag?.pix_name || null;
            const pixInstructions = caps.pix_instructions || ag?.pix_instructions || null;
            const pixTypeLabel = detectPixType(pixKey!);
            const divider = "━━━━━━━━━━━━━━━━━━━━";

            const cardLines: string[] = [
              `💳 *DADOS PARA PAGAMENTO VIA PIX*`,
              divider,
              pixTypeLabel,
              `\`${pixKey}\``,
            ];
            if (pixName) cardLines.push(``, `👤 *Favorecido:* ${pixName}`);
            if (pixInstructions) cardLines.push(``, `ℹ️ ${pixInstructions}`);
            cardLines.push(divider, `_Toque e segure a chave para copiar_`);

            pixTextMessage = cardLines.join("\n");
            log("💳 PIX card built — will send as separate message");
          }
        }
        
        // Check if we should respond with audio (when incoming was audio and setting is enabled)
        if (isAudioMsg && ag?.respond_audio_with_audio && ag?.elevenlabs_voice_id) {
          log("🔊 Responding with audio (respond_audio_with_audio=true)");
          try {
            const ttsText = normalizeTimeForSpeech(audioReply);
            const audioData = await textToSpeech(ttsText, ag.elevenlabs_voice_id);
            if (audioData) {
              await sendAudioViaUazapi(ws, cleanPhone, audioData);
              log("🔊 ✅ Audio response sent!");
            } else {
              log("🔊 TTS returned null, falling back to text");
              await sendHumanizedReply(
                { base_url: ws.base_url, instance_id: ws.instance_id || "", token: ws.token },
                cleanPhone, audioReply
              );
            }
          } catch (e: any) {
            logErr("🔊 Audio response failed, falling back to text:", e.message);
            await sendHumanizedReply(
              { base_url: ws.base_url, instance_id: ws.instance_id || "", token: ws.token },
              cleanPhone, audioReply
            );
          }
        } else {
          // Standard text reply
          try {
            log("🤖 Sending humanized reply via UAZAPI...");
            await sendHumanizedReply(
              { base_url: ws.base_url, instance_id: ws.instance_id || "", token: ws.token },
              cleanPhone, audioReply
            );
            log("🤖 ✅ Humanized reply sent successfully!");
          } catch (e: any) {
            logErr("🤖 ❌ Send error:", e.message);
          }
        }

        // ── Send PIX card — always as text/button, NEVER audio ──
        if (pixTextMessage) {
          try {
            log("💳 Sending modern PIX card...");
            let pixCardSent = false;

            // Try button format first (best UX — shows key prominently with confirm button)
            try {
              await sendMenuViaUazapi(
                { base_url: ws.base_url, token: ws.token },
                cleanPhone,
                {
                  type: "button",
                  text: pixTextMessage,
                  footerText: "Toque e segure a chave para copiar",
                  choices: [`✅ Recebi os dados|pix_ok`],
                }
              );
              pixCardSent = true;
              log("💳 ✅ PIX modern card (button) sent!");
            } catch (btnErr: any) {
              // Fallback: plain text — still professional, just no interactive button
              log("💳 Button fallback — sending as plain text:", btnErr.message);
              await sendUazapiMessage(ws, cleanPhone, pixTextMessage);
              pixCardSent = true;
              log("💳 ✅ PIX plain text card sent!");
            }

            // ── Save PIX card to DB so deduplication works correctly ──
            // Without this, the dedup check never finds the card marker and always re-sends (or
            // worse, matches against the AI's conversational reply and never sends).
            if (pixCardSent) {
              try {
                await sb.from("whatsapp_messages").insert({
                  conversation_id: conv.id,
                  company_id: cid,
                  direction: "outgoing",
                  message_type: "text",
                  content: pixTextMessage,
                  delivery_status: "sent",
                });
                log("💳 ✅ PIX card saved to DB for dedup tracking");
              } catch (saveErr: any) {
                log("💳 ⚠️ Could not save PIX card to DB (non-fatal):", saveErr.message);
              }
            }
          } catch (e: any) {
            logErr("💳 ❌ PIX card failed entirely:", e.message);
          }
        }
      } else {
        log("🤖 ⚠️ Cannot send: WS inactive or missing credentials");
      }
    }

    // ── Mark complaint pending — full registration happens after 10 min inactivity ──
    try {
      await markComplaintPending(sb, conv.id, actualMsg);
    } catch (e: any) {
      log("📋 markComplaintPending error (non-fatal):", e.message);
    }

    // ── Auto-react to client's message based on agent settings ──
    if (ag?.auto_react_enabled) {
      try {
        const ws2 = await getWsCredentials(sb, cid, agentOptions.instanceId);
        if (ws2?.base_url && ws2?.token) {
          // Get the last incoming message's wa_message_id
          const { data: lastIncoming } = await sb.from("whatsapp_messages")
            .select("wa_message_id")
            .eq("conversation_id", conv.id)
            .eq("direction", "incoming")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          
          if (lastIncoming?.wa_message_id) {
            // Detect intent from the reply to choose appropriate reaction
            let autoEmoji: string | null = null;
            const lowerReply = (displayReply || "").toLowerCase();
            const lowerMsg = actualMsg.toLowerCase();
            
            if (lowerReply.includes("confirmado") || lowerReply.includes("✅")) {
              autoEmoji = ag.react_on_confirm || "✅";
            } else if (lowerReply.includes("cancelado") || lowerReply.includes("cancelamento")) {
              autoEmoji = ag.react_on_cancel || "😢";
            } else if (lowerReply.includes("agendamento criado") || lowerReply.includes("📅")) {
              autoEmoji = ag.react_on_booking || "📅";
            } else if (/obrigad[oa]|valeu|gratidão/i.test(lowerMsg)) {
              autoEmoji = ag.react_on_thanks || "❤️";
            } else if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|hi|hello)/i.test(lowerMsg)) {
              autoEmoji = ag.react_on_greeting || "👋";
            }
            
            if (autoEmoji) {
              await reactToMessage({ base_url: ws2.base_url, token: ws2.token }, lastIncoming.wa_message_id, autoEmoji);
              log("😀 ✅ Auto-reacted with:", autoEmoji);
            }
          }
        }
      } catch (e: any) {
        log("😀 Auto-react error (non-fatal):", e.message);
      }
    }

    return { ok: true, response: displayReply, conversation_id: conv.id, is_audio: isAudioMsg };
  } catch (aiErr: any) {
    logErr("🤖 ❌ AI call FAILED:", aiErr.message, aiErr.stack);
    // Release processing lock on error so next message isn't blocked
    if (agentOptions._lockMsgId) {
      try { await sb.from("whatsapp_messages").delete().eq("id", agentOptions._lockMsgId); } catch {}
      log("🔓 Processing lock released (error path)");
    }
    return { error: aiErr.message, conversation_id: conv?.id };
  }
}

async function loadCtx(sb: any, cid: string, ph: string, convId: string, instanceId?: string | null) {
  const cp = ph.replace(/\D/g, "");

  // Load agent settings scoped to instance, with company-level fallback
  let agentCaps: any = {};
  if (instanceId) {
    const { data: instCaps } = await sb
      .from("whatsapp_agent_settings")
      .select("custom_prompt, timezone, can_share_address, can_share_phone, can_share_business_hours, can_share_services, can_share_professionals, can_handle_anamnesis, can_send_files, can_send_images, can_send_audio, custom_business_info, can_send_payment_link, payment_link_url, can_send_pix, pix_key, pix_name, pix_instructions, pix_send_as_text, can_read_media, media_vision_model, temperature, top_p, frequency_penalty, presence_penalty, max_tokens, ai_model, preferred_provider, greeting_message, elevenlabs_api_key, elevenlabs_voice_id, openai_api_key, gemini_api_key")
      .eq("company_id", cid)
      .eq("instance_id", instanceId)
      .maybeSingle();
    if (instCaps) {
      agentCaps = instCaps;
      log("📚 loadCtx: using INSTANCE-SPECIFIC agent caps for instance:", instanceId);
    }
  }
  if (!agentCaps || Object.keys(agentCaps).length === 0) {
    const { data: companyCaps } = await sb
      .from("whatsapp_agent_settings")
      .select("custom_prompt, timezone, can_share_address, can_share_phone, can_share_business_hours, can_share_services, can_share_professionals, can_handle_anamnesis, can_send_files, can_send_images, can_send_audio, custom_business_info, can_send_payment_link, payment_link_url, can_send_pix, pix_key, pix_name, pix_instructions, pix_send_as_text, can_read_media, media_vision_model, temperature, top_p, frequency_penalty, presence_penalty, max_tokens, ai_model, preferred_provider, greeting_message, elevenlabs_api_key, elevenlabs_voice_id, openai_api_key, gemini_api_key")
      .eq("company_id", cid)
      .is("instance_id", null)
      .maybeSingle();
    agentCaps = companyCaps || {};
    log("📚 loadCtx: using COMPANY-DEFAULT agent caps (instanceId:", instanceId || "none", ")");
  }

  const [m, a, c, s, h, k, cs, st, ss, af] = await Promise.all([
    sb.from("whatsapp_messages").select("direction, content, created_at").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(20),
    sb.from("appointments").select("id, client_name, appointment_date, start_time, end_time, status, services(name), staff(name)").eq("company_id", cid).or("client_phone.eq." + cp + ",client_phone.eq.+" + cp).in("status", ["pending", "confirmed"]).order("appointment_date", { ascending: true }).limit(10),
    sb.from("companies").select("name, address, phone").eq("id", cid).single(),
    sb.from("services").select("id, name, duration, price, description, image_url").eq("company_id", cid).eq("active", true),
    sb.from("business_hours").select("day_of_week, open_time, close_time, is_open").eq("company_id", cid),
    sb.from("whatsapp_knowledge_base").select("category, title, content").eq("company_id", cid).eq("active", true),
    sb.from("company_settings").select("slot_interval, max_capacity_per_slot, min_advance_hours").eq("company_id", cid).single(),
    sb.from("staff").select("id, name").eq("company_id", cid).eq("active", true),
    sb.from("staff_services").select("staff_id, service_id").in("staff_id", (await sb.from("staff").select("id").eq("company_id", cid).eq("active", true)).data?.map((x: any) => x.id) || []),
    sb.from("whatsapp_agent_files").select("file_name, file_url, file_type, description").eq("company_id", cid).eq("active", true),
  ]);

  return {
    msgs: (m.data || []).reverse(), appts: a.data || [], co: c.data || {}, svcs: s.data || [], hrs: h.data || [],
    kb: k.data || [], cs: { ...(cs.data || {}), custom_prompt: agentCaps.custom_prompt, timezone: agentCaps.timezone || "America/Sao_Paulo", ai_model: agentCaps.ai_model || "google/gemini-3-flash-preview", temperature: agentCaps.temperature ?? 0.3, top_p: agentCaps.top_p ?? 0.9, frequency_penalty: agentCaps.frequency_penalty ?? 0.4, presence_penalty: agentCaps.presence_penalty ?? 0.1, max_tokens: agentCaps.max_tokens ?? 500 },
    staff: st.data || [], staffServices: ss.data || [], agentFiles: af.data || [],
    caps: {
      can_share_address: agentCaps.can_share_address ?? true,
      can_share_phone: agentCaps.can_share_phone ?? true,
      can_share_business_hours: agentCaps.can_share_business_hours ?? true,
      can_share_services: agentCaps.can_share_services ?? true,
      can_share_professionals: agentCaps.can_share_professionals ?? true,
      can_handle_anamnesis: agentCaps.can_handle_anamnesis ?? false,
      can_send_files: agentCaps.can_send_files ?? false,
      can_send_images: agentCaps.can_send_images ?? false,
      can_send_audio: agentCaps.can_send_audio ?? false,
      custom_business_info: agentCaps.custom_business_info || null,
      can_send_payment_link: agentCaps.can_send_payment_link ?? false,
      payment_link_url: agentCaps.payment_link_url || null,
      can_send_pix: agentCaps.can_send_pix ?? false,
      pix_key: agentCaps.pix_key || null,
      pix_name: agentCaps.pix_name || null,
      pix_instructions: agentCaps.pix_instructions || null,
      pix_send_as_text: agentCaps.pix_send_as_text ?? true,
      can_read_media: agentCaps.can_read_media ?? false,
      media_vision_model: agentCaps.media_vision_model || "google/gemini-3-flash-preview",
    },
  };
}

async function callAI(sb: any, cid: string, conv: any, ctx: any, userMsg: string, opts?: { isAudioMsg?: boolean; agentSettings?: any; instanceId?: string | null }): Promise<string> {
  const ag = opts?.agentSettings;
  const agentOptions = { instanceId: opts?.instanceId ?? null };
  const preferredProvider = ag?.preferred_provider || "lovable";
  const aiModelRaw = ag?.ai_model || "google/gemini-3-flash-preview";
  
  // Determine API endpoint and key based on preferred provider
  // Smart routing: if preferred_provider=openai but model is google/*, fallback to lovable gateway
  let apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
  let apiKey = Deno.env.get("LOVABLE_API_KEY");
  let providerLabel = "lovable";
  
  const modelIsOpenAI = aiModelRaw.startsWith("openai/") || (!aiModelRaw.includes("/") && !aiModelRaw.startsWith("gemini-"));
  const modelIsGemini = aiModelRaw.startsWith("google/") || aiModelRaw.startsWith("gemini-");
  
  if (preferredProvider === "openai" && ag?.openai_api_key && modelIsOpenAI) {
    apiUrl = "https://api.openai.com/v1/chat/completions";
    apiKey = ag.openai_api_key;
    providerLabel = "openai";
    log("🧠 Using tenant's OWN OpenAI key");
  } else if (preferredProvider === "gemini" && ag?.gemini_api_key && modelIsGemini) {
    // Use Gemini via OpenAI-compatible endpoint
    apiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    apiKey = ag.gemini_api_key;
    providerLabel = "gemini";
    log("🧠 Using tenant's OWN Gemini key");
  } else {
    // Lovable gateway handles both openai/* and google/* models
    log("🧠 Using platform LOVABLE_API_KEY (provider:", preferredProvider, "model:", aiModelRaw, ")");
  }
  
  if (!apiKey) throw new Error("No API key available for provider: " + preferredProvider);

  const hrs = (ctx.hrs || []).sort((a: any, b: any) => a.day_of_week - b.day_of_week).map((x: any) => DN[x.day_of_week] + ": " + (x.is_open ? (x.open_time || "").substring(0, 5) + "-" + (x.close_time || "").substring(0, 5) : "Fechado")).join("; ");
  const svcs = (ctx.svcs || []).map((x: any) => x.name + " (id:" + x.id + ") " + x.duration + "min R$" + (x.price || "?") + (x.description ? " desc:" + x.description : "") + (x.image_url ? " image_url:" + x.image_url : "")).join("; ");
  const kbs = (ctx.kb || []).map((x: any) => x.title + ": " + x.content).join("; ");
  const appts = (ctx.appts || []).map((x: any, i: number) => (i + 1) + "." + (x.services?.name || "?") + " " + x.appointment_date + " " + (x.start_time || "").substring(0, 5) + " " + x.status + " (id:" + x.id + ")" + (x.staff?.name ? " prof:" + x.staff.name : "")).join("; ");

  // Build staff info with their services
  const staffInfo = (ctx.staff || []).map((s: any) => {
    const svcIds = (ctx.staffServices || []).filter((ss: any) => ss.staff_id === s.id).map((ss: any) => ss.service_id);
    const svcNames = (ctx.svcs || []).filter((sv: any) => svcIds.includes(sv.id)).map((sv: any) => sv.name);
    return s.name + " (id:" + s.id + ")" + (svcNames.length ? " - serviços: " + svcNames.join(", ") : " - todos os serviços");
  }).join("; ");

  const hasHistory = ctx.msgs && ctx.msgs.length > 0;
  const caps = ctx.caps || {};

  // Dynamic date/time using configured timezone
  const tz = ctx.cs?.timezone || "America/Sao_Paulo";
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(now);
  const timeStr = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const tzLabel = tz.replace(/_/g, " ").split("/").pop();

  // Build data section conditionally based on capabilities
  const dataParts: string[] = [];
  dataParts.push(ctx.co.name || "");
  if (caps.can_share_address && ctx.co.address) dataParts.push("End: " + ctx.co.address);
  if (caps.can_share_phone && ctx.co.phone) dataParts.push("Tel: " + ctx.co.phone);
  
  const capabilityRules: string[] = [];
  if (!caps.can_share_address) capabilityRules.push("- NÃO informe o endereço do estabelecimento em hipótese alguma");
  if (!caps.can_share_phone) capabilityRules.push("- NÃO informe o telefone do estabelecimento");
  if (!caps.can_share_business_hours) capabilityRules.push("- NÃO informe os horários de funcionamento. Se perguntarem, diga para entrar em contato diretamente");
  if (!caps.can_share_services) capabilityRules.push("- NÃO liste ou detalhe os serviços disponíveis. Oriente o cliente a consultar diretamente");
  if (!caps.can_share_professionals) capabilityRules.push("- NÃO mencione nomes de profissionais específicos");
  if (!caps.can_handle_anamnesis) capabilityRules.push("- NÃO conduza preenchimento de fichas de anamnese");

  // File sending rules
  const fileParts: string[] = [];
  if (caps.can_send_files || caps.can_send_images || caps.can_send_audio) {
    const allowedTypes: string[] = [];
    if (caps.can_send_files) allowedTypes.push("documentos/PDF");
    if (caps.can_send_images) allowedTypes.push("imagens/fotos");
    if (caps.can_send_audio) allowedTypes.push("áudios");
    
    const relevantFiles = (ctx.agentFiles || []).filter((f: any) => {
      if (f.file_type === "document" && caps.can_send_files) return true;
      if (f.file_type === "image" && caps.can_send_images) return true;
      if (f.file_type === "audio" && caps.can_send_audio) return true;
      return false;
    });

    if (relevantFiles.length > 0) {
      fileParts.push(`\nARQUIVOS DISPONÍVEIS PARA ENVIO (${allowedTypes.join(", ")}):`);
      fileParts.push("Quando for relevante, use a ferramenta send_file para enviar um arquivo ao cliente.");
      for (const f of relevantFiles) {
        fileParts.push(`- "${f.file_name}" (${f.file_type})${f.description ? ": " + f.description : ""} | url: ${f.file_url}`);
      }
    }
  }

  // Custom prompt takes TOP PRIORITY — it defines who the agent IS and how it should behave
  const hasCustomPrompt = !!(ctx.cs?.custom_prompt && ctx.cs.custom_prompt.trim());
  const customBusinessInfo = caps.custom_business_info ? `\nINFORMAÇÕES DO ESTABELECIMENTO:\n${caps.custom_business_info}\n` : "";
  
  // When custom prompt exists, it REPLACES the default identity entirely
  const identitySection = hasCustomPrompt 
    ? `IDENTIDADE E COMPORTAMENTO DO AGENTE (PRIORIDADE MÁXIMA — SIGA ESTAS INSTRUÇÕES ACIMA DE QUALQUER OUTRA REGRA):
${ctx.cs.custom_prompt}
${customBusinessInfo}
--- FIM DAS INSTRUÇÕES DE IDENTIDADE ---

Você está respondendo via WhatsApp para a empresa ${ctx.co.name || "nossa empresa"}. Siga EXCLUSIVAMENTE as instruções de identidade acima para definir quem você é, como se comporta, e o que responde. As regras abaixo são apenas complementares e NÃO devem contradizer as instruções acima.`
    : `Você é a atendente virtual de ${ctx.co.name || "nossa empresa"} no WhatsApp.${customBusinessInfo}`;

  const sys = `${identitySection}

DATA E HORA ATUAL (use como referência oficial):
${dateStr}, ${timeStr} (fuso: ${tzLabel})

⛔ REGRAS ABSOLUTAS DE COMPORTAMENTO — SEGUIR SEMPRE, SEM EXCEÇÃO:

0. NUNCA INVENTE INFORMAÇÕES — REGRA DE OURO (MAIS IMPORTANTE DE TODAS):
   - Você APENAS pode mencionar serviços, profissionais, preços, horários e informações que estejam EXPLICITAMENTE listados abaixo na seção DADOS.
   - ${(ctx.svcs || []).length === 0 ? "⛔ NÃO HÁ SERVIÇOS CADASTRADOS. PROIBIDO inventar, sugerir ou mencionar qualquer serviço específico (como 'corte', 'barba', 'manicure', etc.). Se o cliente perguntar sobre serviços, diga apenas que em breve terá mais informações disponíveis ou oriente-o a entrar em contato diretamente." : `Os ÚNICOS serviços existentes são: ${(ctx.svcs || []).map((x: any) => x.name).join(", ")}. PROIBIDO citar qualquer outro serviço fora desta lista.`}
   - PROIBIDO usar serviços de exemplo genéricos como "Corte de cabelo", "Barba", "Manicure" se não estiverem cadastrados.
   - PROIBIDO inventar preços, durações ou descrições que não estejam nos dados abaixo.
   - Se não souber uma informação, diga que não tem essa informação no momento.

1. UMA ÚNICA RESPOSTA POR INTERAÇÃO:
   - Responda com UMA única mensagem de texto completa
   - NUNCA divida em múltiplas partes ou mensagens
   - NUNCA use "\\n\\n" para separar blocos como balões distintos
   - Tudo que você escrever vai em UMA mensagem só
   - Ao usar botões (send_buttons, send_list, send_carousel), NÃO retorne texto adicional fora dos campos da ferramenta

2. LINGUAGEM HUMANA E NATURAL — RESPOSTAS CURTAS:
   - Fale como um atendente real e simpático: informal, direta, acolhedora
   - MÁXIMO 3 frases curtas por resposta — seja extremamente conciso
   - Se precisar listar opções, use botões (send_buttons/send_list) em vez de texto longo
   - NUNCA escreva parágrafos longos ou explicações detalhadas não solicitadas
   - Emojis com moderação (1-2 por mensagem, só quando natural)
   - SEM formatação markdown, SEM negrito/itálico
   - PROIBIDO usar frases robóticas como "Como posso te ajudar hoje?", "Em que posso ser útil?", "Olá! Seja bem-vindo(a)!"
   - Prefira respostas diretas e contextuais ao invés de saudações genéricas

3. NUNCA REPITA SAUDAÇÃO:
   - ${hasHistory ? "Esta conversa JÁ ESTÁ EM ANDAMENTO. NÃO cumprimente novamente. NÃO diga 'oi', 'olá', 'tudo bem?'. Vá direto ao ponto respondendo a última mensagem." : "Esta é a PRIMEIRA mensagem. Cumprimente de forma breve e natural — apenas uma vez."}
   - NUNCA repita saudações se já houve troca de mensagens
   - Analise o histórico antes de responder para não repetir informações já ditas

4. NUNCA REPITA O NOME DO CLIENTE EM TODAS AS MENSAGENS:
   - Nome do cliente: ${conv.client_name || "DESCONHECIDO"}
   - ${conv.client_name ? `Pode usar "${conv.client_name}" de forma ocasional para personalizar (ex: "Claro, ${conv.client_name}!"), mas NÃO coloque o nome em cada mensagem. Deixe a conversa fluir naturalmente.` : "O nome do cliente ainda NÃO É CONHECIDO. Na primeira oportunidade natural, pergunte o nome de forma casual (ex: 'Como você se chama?'). Use save_client_name assim que souber."}
   - Se o cliente informar o nome em qualquer mensagem, use save_client_name IMEDIATAMENTE
   - Se o cliente já disse o nome, NÃO pergunte de novo

5. MENSAGENS QUEBRADAS = UMA CONVERSA:
   - Se o cliente enviou várias mensagens curtas em sequência (ex: "Oi", "tudo", "bem?"), considere TUDO como uma única frase
   - Responda ao conjunto completo, não a cada parte isolada
   - NÃO repita ou cite cada fragmento de volta ao cliente
   - Responda de forma fluida e natural como se fosse uma única mensagem

6. NÃO REPITA O QUE JÁ FOI DITO:
   - Se já informou horários/serviços, NÃO repita — diga "como mencionei" ou vá direto ao próximo passo
   - Se já cumprimentou, não cumprimente de novo
   - Analise o histórico completo antes de cada resposta
${capabilityRules.length > 0 ? "\nRESTRIÇÕES DE INFORMAÇÃO (OBEDEÇA RIGOROSAMENTE):\n" + capabilityRules.join("\n") : ""}

NORMALIZAÇÃO DE HORÁRIOS (OBRIGATÓRIO):
- SEMPRE escreva horários por extenso, de forma natural e direta. Exemplos: "nove da manhã", "nove e meia", "meio-dia", "seis da tarde", "das nove às seis da tarde"
- NUNCA use formato numérico como "09:00" ou "18:00" na resposta. Escreva TUDO por extenso.
- PROIBIDO falar dígitos separados ("zero nove zero zero")
- Seja direto: "a gente funciona das nove da manhã às seis da tarde" em vez de frases longas

⛔ REGRA ABSOLUTA — IMAGENS E DOCUMENTOS (NUNCA IGNORE):
- Se a mensagem contém "[SISTEMA: O cliente enviou uma imagem" ou "[SISTEMA: O cliente enviou um documento" e menciona "LEITURA DE MÍDIA ESTÁ DESABILITADA", significa que você NÃO pode ver o conteúdo. Nesse caso:
  1. NUNCA assuma que é um comprovante de pagamento
  2. NUNCA confirme pagamento ou agendamento com base em imagem não analisada
  3. Informe educadamente que não consegue visualizar imagens/documentos no momento e peça ao cliente para descrever o que enviou

${caps.can_read_media ? `LEITURA DE IMAGENS E DOCUMENTOS (CAPACIDADE ATIVA):
- Quando a mensagem contém "CONTEÚDO ANALISADO:", o sistema de visão já analisou a mídia. Use essa análise.
- O resultado inclui TIPO, CONTEÚDO, TEXTOS_LEGÍVEIS e OBSERVAÇÕES.

⚠️ REGRAS ANTI-FRAUDE CRÍTICAS:
1. APENAS confirme comprovante se TIPO for EXATAMENTE "COMPROVANTE_PAGAMENTO" E todos estes dados estiverem presentes: banco emissor, valor, data, destinatário/chave PIX E ID/código da transação.
2. Se TIPO for qualquer outro (FOTO_GERAL, DOCUMENTO_GERAL, etc.), NÃO trate como comprovante. Informe o que foi identificado e pergunte como pode ajudar.
3. Em caso de dúvida, responda: "Recebi a imagem, mas não consegui identificar claramente um comprovante de pagamento. Pode enviá-la novamente em melhor qualidade ou descrever o valor e banco?"
4. Se for comprovante válido, informe que foi RECEBIDO para verificação, mas NÃO confirme o serviço automaticamente — a confirmação definitiva depende de revisão interna.
5. Para outros tipos: foto de referência → sugira o serviço adequado; exame/laudo → responda com base nos dados; orçamento → extraia os valores.` : `LEITURA DE IMAGENS: DESABILITADA
- Você NÃO tem capacidade de ver imagens ou documentos enviados por clientes.
- Se o cliente enviar uma imagem, informe que não consegue visualizá-la e peça para descrever o que precisa.
- NUNCA confirme pagamentos, comprovantes ou qualquer conteúdo baseado em imagem.`}

FLUXO DE AGENDAMENTO:
${(ctx.svcs || []).length === 0 
  ? `⛔ NÃO HÁ SERVIÇOS CADASTRADOS NO SISTEMA. Você NÃO pode realizar agendamentos pois não há serviços disponíveis. Se o cliente quiser agendar, diga que os serviços ainda estão sendo configurados e oriente-o a entrar em contato diretamente.`
  : `- Quando o cliente quiser agendar, pergunte: 1) Qual serviço? 2) Qual data/horário de preferência?
- Use check_availability para verificar disponibilidade na data
- ${caps.can_share_professionals && staffInfo ? `Profissionais disponíveis: ${staffInfo}` : "Nenhum profissional cadastrado - agende sem profissional"}
- ${caps.can_share_professionals && (ctx.staff || []).length > 1 ? "Se houver mais de um profissional para o serviço, pergunte a preferência do cliente" : ""}
- ${(ctx.staff || []).length === 1 ? "Há apenas um profissional, agende diretamente com ele sem perguntar" : ""}
- Depois de confirmar serviço, data, horário${(ctx.staff || []).length > 1 && caps.can_share_professionals ? " e profissional" : ""}, use book_appointment para criar o agendamento
- Para remarcar, use check_availability no novo dia e depois reschedule_appointment
- Para cancelar, confirme com o cliente e use cancel_appointment
- O agendamento criado será automaticamente sincronizado com o Google Agenda`}

BOTÕES INTERATIVOS (OBRIGATÓRIO — SEMPRE USE QUANDO HOUVER ESCOLHA):
- REGRA: Toda vez que o cliente precisa ESCOLHER entre opções, você DEVE usar send_buttons, send_list ou send_carousel. NUNCA liste opções como texto simples.
- send_buttons: para 2-3 opções rápidas (serviços, sim/não, profissionais, horários)
- send_list: para 4+ opções (muitos horários, muitos serviços)
- send_carousel: para mostrar serviços/produtos com IMAGEM. Cada card tem título, descrição, imagem e botões. Use quando os serviços tiverem imagens cadastradas.
- Formato choices para buttons: ["Texto do botão|id_curto"] — use APENAS serviços reais cadastrados como opções
- Formato choices para list: ["Título|Descrição"] — ex: ["09:00|Horário disponível", "10:30|Horário disponível"]
- Formato cards para carousel: [{ title: "Serviço", body: "descrição do serviço ou duração/preço", image: "URL_REAL_DO_SERVIÇO", choices: ["Agendar|svc_id"] }]
- IMPORTANTE para carousel: Use EXATAMENTE a image_url fornecida no contexto dos serviços. NUNCA invente URLs de imagem. Se o serviço tem "image_url:https://..." no contexto, use essa URL exata no campo "image" do card.
- IMPORTANTE para body do card: Inclua a descrição do serviço (campo "desc:" no contexto) se disponível, junto com duração e preço.
- EXEMPLOS DE USO OBRIGATÓRIO:
  ${(ctx.svcs || []).length > 0 ? `* Cliente quer agendar e há serviços COM image_url no contexto → send_carousel usando as URLs reais
  * Cliente quer agendar e há serviços SEM image_url → send_buttons (≤3) ou send_list (>3) com os serviços reais cadastrados` : "* NÃO há serviços cadastrados → NÃO use botões de serviço. Oriente o cliente a entrar em contato."}
  * Verificou disponibilidade e há horários → send_buttons com top 3 horários (ou send_list se >3)
  * Precisa confirmar algo → send_buttons ["Sim|sim", "Não|nao"]
  * Precisa escolher profissional → send_buttons com nomes dos profissionais reais listados acima
- IMPORTANTE: Ao usar send_buttons/send_list, inclua o texto explicativo no campo "text" do botão. NÃO retorne texto adicional no content — o texto dos botões já é a resposta.
- ⛔ PROIBIDO: Criar botões com serviços, profissionais ou informações que não existam na seção DADOS abaixo.

RESPOSTAS DE BOTÕES (QUANDO O CLIENTE CLICA EM UM BOTÃO):
- Quando o cliente clica em um botão interativo, a mensagem chega no formato: [BOTÃO CLICADO: id="xxx" texto="yyy"] yyy
- O "id" corresponde ao id_curto que foi enviado no botão (ex: svc_corte, slot_0900, sim, nao)
- Use o ID para identificar a escolha do cliente e prosseguir no fluxo:
  * IDs começando com "svc_" = serviço selecionado → pergunte a data/horário e use check_availability
  * IDs começando com "slot_" = horário selecionado (formato slot_HHMM) → confirme e use book_appointment
  * ID "sim" ou "nao" = resposta de confirmação
- Trate a resposta de botão como se o cliente tivesse digitado a escolha — continue o fluxo normalmente
- NÃO pergunte novamente o que o cliente já escolheu pelo botão

DADOS (use só quando relevante, não despeje tudo de uma vez):
${dataParts.join(" | ")}
${caps.can_share_business_hours ? "Horários: " + hrs : ""}
${caps.can_share_services ? "Serviços: " + svcs : ""}
${caps.can_share_professionals ? "Profissionais: " + (staffInfo || "nenhum cadastrado") : ""}
${kbs ? "Info extra: " + kbs : ""}
${!hasCustomPrompt && caps.custom_business_info ? "Info do estabelecimento: " + caps.custom_business_info : ""}
Agendamentos do cliente: ${appts || "nenhum"}
${fileParts.join("\n")}
${caps.can_send_payment_link && caps.payment_link_url ? "\nPAGAMENTO - LINK:\nQuando o cliente perguntar sobre pagamento ou após confirmar agendamento, envie o link: " + caps.payment_link_url : ""}
${caps.can_send_pix && caps.pix_key ? ("\nPAGAMENTO - PIX:\nChave PIX: " + caps.pix_key + (caps.pix_name ? " | Titular: " + caps.pix_name : "") + (caps.pix_instructions ? "\nInstruções: " + caps.pix_instructions : "") + "\n\n⚠️ REGRA CRÍTICA — CHAVE PIX NO ÁUDIO:\nJAMÁIS leia ou mencione a chave PIX em voz alta ou por extenso no corpo da sua resposta textual. A chave PIX é enviada automaticamente pelo sistema em um card separado e formatado para o cliente copiar com facilidade.\nAo falar sobre PIX, diga APENAS: 'Os dados completos para pagamento via PIX foram enviados em mensagem separada para facilitar a cópia. Qualquer dúvida, estou à disposição!'\nO sistema detectará a chave na sua resposta e a exibirá em formato profissional. Por isso INCLUA o valor literal '" + caps.pix_key + "' em algum ponto do texto (o sistema remove antes do áudio). Exemplo correto: 'Claro! A chave PIX para pagamento é " + caps.pix_key + ". Os dados completos foram enviados em mensagem separada para facilitar a cópia.'") : ""}`;


  const messages: any[] = [{ role: "system", content: sys }];
  for (const m of ctx.msgs) messages.push({ role: m.direction === "incoming" ? "user" : "assistant", content: m.content || "" });
  messages.push({ role: "user", content: userMsg });

  const aiModel = ctx.cs?.ai_model || "google/gemini-3-flash-preview";
  log("🧠 AI request: model=" + aiModel + ", messages:", messages.length, "system_len:", sys.length);

  const tools: any[] = [
    { type: "function", function: { name: "confirm_appointment", description: "Confirma agendamento existente", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
    { type: "function", function: { name: "cancel_appointment", description: "Cancela agendamento existente", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
    { type: "function", function: { name: "check_availability", description: "Verifica horários disponíveis em uma data. Use TAMBÉM para verificar disponibilidade de um profissional específico passando staff_id.", parameters: { type: "object", properties: { date: { type: "string", description: "Data no formato YYYY-MM-DD" }, staff_id: { type: "string", description: "ID do profissional (opcional, filtra por profissional)" }, service_id: { type: "string", description: "ID do serviço (opcional, considera duração do serviço)" } }, required: ["date"] } } },
    { type: "function", function: { name: "book_appointment", description: "Cria um novo agendamento para o cliente", parameters: { type: "object", properties: { service_id: { type: "string", description: "ID do serviço" }, date: { type: "string", description: "Data YYYY-MM-DD" }, time: { type: "string", description: "Horário HH:MM" }, staff_id: { type: "string", description: "ID do profissional (opcional)" } }, required: ["service_id", "date", "time"] } } },
    { type: "function", function: { name: "reschedule_appointment", description: "Reagenda um agendamento existente para nova data/hora", parameters: { type: "object", properties: { appointment_id: { type: "string" }, new_date: { type: "string" }, new_time: { type: "string" } }, required: ["appointment_id", "new_date", "new_time"] } } },
    { type: "function", function: { name: "request_handoff", description: "Transfere para atendente humano", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "save_client_name", description: "Salva o nome do cliente quando ele se apresenta", parameters: { type: "object", properties: { name: { type: "string", description: "Nome do cliente" } }, required: ["name"] } } },
  ];

  // Add interactive menu tools (buttons and list)
  tools.push({
    type: "function",
    function: {
      name: "send_buttons",
      description: "Envia botões interativos ao cliente via WhatsApp. Útil para oferecer opções rápidas como escolha de serviço, confirmação sim/não, ou seleção de horário. Máximo 3 botões de resposta.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texto principal da mensagem acima dos botões" },
          choices: { type: "array", items: { type: "string" }, description: "Array de opções. Formato: 'Texto do botão|id_curto'. Ex: ['Corte de cabelo|svc_corte', 'Barba|svc_barba', 'Combo|svc_combo']" },
          footer_text: { type: "string", description: "Texto de rodapé opcional (aparece abaixo dos botões)" },
        },
        required: ["text", "choices"],
      },
    },
  });

  tools.push({
    type: "function",
    function: {
      name: "send_list",
      description: "Envia um menu lista expansível ao cliente. Útil quando há mais de 3 opções (serviços, horários disponíveis, etc). O cliente toca em 'Ver opções' para expandir.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texto principal da mensagem" },
          title: { type: "string", description: "Título do botão que abre a lista (ex: 'Ver serviços')" },
          choices: { type: "array", items: { type: "string" }, description: "Array de opções. Formato: 'Título da opção|descrição opcional'. Ex: ['Corte Masculino|30min - R$45', 'Barba|20min - R$30']" },
          footer_text: { type: "string", description: "Texto de rodapé opcional" },
        },
        required: ["text", "title", "choices"],
      },
    },
  });

  // Add carousel tool
  tools.push({
    type: "function",
    function: {
      name: "send_carousel",
      description: "Envia um carrossel de cards com imagem e botões via WhatsApp. Cada card pode ter título, descrição, imagem e até 2 botões. Ideal para mostrar serviços com foto, pacotes ou opções visuais. Máximo 10 cards.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texto introdutório acima do carrossel" },
          cards: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Título do card" },
                body: { type: "string", description: "Descrição do card (opcional)" },
                image: { type: "string", description: "URL da imagem do card (opcional)" },
                choices: { type: "array", items: { type: "string" }, description: "Botões do card. Formato: 'Texto|id'. Máximo 2 botões por card." },
              },
              required: ["title", "choices"],
            },
            description: "Array de cards do carrossel (máx 10)",
          },
          footer_text: { type: "string", description: "Texto de rodapé opcional" },
        },
        required: ["text", "cards"],
      },
    },
  });

  // Add send_file tool only if file sending is enabled and there are files
  if ((caps.can_send_files || caps.can_send_images || caps.can_send_audio) && (ctx.agentFiles || []).length > 0) {
    tools.push({
      type: "function",
      function: {
        name: "send_file",
        description: "Envia um arquivo (PDF, imagem ou áudio) ao cliente via WhatsApp. Use quando o contexto da conversa indicar que o arquivo seria útil.",
        parameters: { type: "object", properties: { file_url: { type: "string", description: "URL do arquivo a enviar" }, file_name: { type: "string", description: "Nome do arquivo para referência" }, file_type: { type: "string", description: "Tipo: document, image ou audio" } }, required: ["file_url", "file_name", "file_type"] },
      },
    });
  }

  // Map model name for direct API providers
  let requestModel = aiModel;
  if (providerLabel === "openai" && aiModel.startsWith("openai/")) {
    requestModel = aiModel.replace("openai/", "");
  } else if (providerLabel === "gemini") {
    // Map lovable model names to Gemini model names
    const geminiMap: Record<string, string> = {
      "google/gemini-2.5-flash": "gemini-2.5-flash",
      "google/gemini-2.5-pro": "gemini-2.5-pro",
      "google/gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
      "google/gemini-2.0-flash": "gemini-2.0-flash",
      "google/gemini-3-flash-preview": "gemini-3-flash-preview",
      "google/gemini-3-pro-preview": "gemini-3-pro-preview",
    };
    requestModel = geminiMap[aiModel] || aiModel.replace("google/", "");
  } else if (providerLabel === "lovable") {
    // Lovable gateway: if model starts with "openai/" map to valid lovable model IDs
    // The Lovable gateway uses the same model IDs as configured (openai/gpt-5, google/gemini-*)
    // If an invalid/legacy model was saved, fall back to a safe default
    const validLovableModels = [
      "openai/gpt-5", "openai/gpt-5-mini", "openai/gpt-5-nano", "openai/gpt-5.2",
      "google/gemini-2.5-pro", "google/gemini-2.5-flash", "google/gemini-2.5-flash-lite",
      "google/gemini-3-pro-preview", "google/gemini-3-flash-preview",
    ];
    if (!validLovableModels.includes(requestModel)) {
      log("🧠 ⚠️ Invalid model for lovable gateway:", requestModel, "→ falling back to google/gemini-3-flash-preview");
      requestModel = "google/gemini-3-flash-preview";
    }
  }

  log("🧠 Sending request to", providerLabel, "provider, model:", requestModel);
  const t0 = Date.now();

  // OpenAI gpt-5+ usa max_completion_tokens; modelos legados e Gemini usam max_tokens
  // gpt-5, o1, o3 families don't support temperature/top_p (only default=1 is allowed)
  const isNewOpenAIModel = requestModel.includes("gpt-5") || requestModel.includes("o1") || requestModel.includes("o3");
  const isNewOpenAI = providerLabel === "openai" && isNewOpenAIModel;
  const isLovableNewModel = providerLabel === "lovable" && isNewOpenAIModel;
  const supportsTemperature = !isNewOpenAI && !isLovableNewModel;
  // max_completion_tokens for new OpenAI models (both direct and via lovable gateway)
  const tokenLimitKey = (isNewOpenAI || isLovableNewModel) ? "max_completion_tokens" : "max_tokens";

  // Inference parameters from agent settings
  const temperature = ctx.cs?.temperature ?? 0.3;
  const topP = ctx.cs?.top_p ?? 0.9;
  const maxTokens = ctx.cs?.max_tokens ?? 500;
  // frequency_penalty and presence_penalty only supported by OpenAI/Lovable (not Gemini direct)
  const frequencyPenalty = ctx.cs?.frequency_penalty ?? 0.4;
  const presencePenalty = ctx.cs?.presence_penalty ?? 0.1;

  const inferenceParams: Record<string, any> = {
    model: requestModel,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    [tokenLimitKey]: maxTokens,
    // Only include temperature/top_p for models that support it
    ...(supportsTemperature ? { temperature, top_p: topP } : {}),
  };
  // Penalty params only for OpenAI-compatible endpoints (not Gemini direct API) and only when temperature is supported
  if (providerLabel !== "gemini" && supportsTemperature) {
    inferenceParams.frequency_penalty = frequencyPenalty;
    inferenceParams.presence_penalty = presencePenalty;
  }

  let r = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(inferenceParams),
  });
  log("🧠 AI response status:", r.status, "in", Date.now() - t0, "ms");

  // Fallback: if Lovable gateway returns 402 (out of credits), try with OPENAI_API_KEY secret
  if (!r.ok && r.status === 402 && providerLabel === "lovable") {
    const fallbackKey = Deno.env.get("OPENAI_API_KEY");
    if (fallbackKey) {
      log("🧠 ⚠️ Lovable gateway 402 — falling back to OPENAI_API_KEY with gpt-4o-mini");
      await r.text(); // consume body to avoid resource leak
      const fallbackModel = "gpt-4o-mini";
      const fallbackParams = { ...inferenceParams, model: fallbackModel };
      // gpt-4o-mini uses max_tokens
      delete fallbackParams.max_completion_tokens;
      const t1 = Date.now();
      r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + fallbackKey, "Content-Type": "application/json" },
        body: JSON.stringify(fallbackParams),
      });
      log("🧠 Fallback AI response status:", r.status, "in", Date.now() - t1, "ms");
    }
  }

  if (!r.ok) {
    const t = await r.text();
    logErr("🧠 ❌ AI ERROR:", r.status, t.substring(0, 500));
    throw new Error("AI " + r.status + ": " + t.substring(0, 200));
  }

  const ai = await r.json();
  const ch = ai.choices?.[0];
  log("🧠 AI finish_reason:", ch?.finish_reason, "has_tool_calls:", !!ch?.message?.tool_calls, "content_len:", ch?.message?.content?.length);

  // ── Log token usage ──
  const usage = ai.usage;
  if (usage) {
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || inputTokens + outputTokens;
    const provider = providerLabel;
    
    // Fetch pricing
    let inputCostPer1k = 0, outputCostPer1k = 0;
    try {
      const { data: pricing } = await sb.from("llm_model_pricing").select("input_cost_per_1k, output_cost_per_1k").eq("model", aiModel).eq("active", true).limit(1);
      if (pricing && pricing.length > 0) {
        inputCostPer1k = Number(pricing[0].input_cost_per_1k) || 0;
        outputCostPer1k = Number(pricing[0].output_cost_per_1k) || 0;
      }
    } catch {}
    
    const totalCost = (inputTokens / 1000 * inputCostPer1k) + (outputTokens / 1000 * outputCostPer1k);
    
    try {
      await sb.from("llm_usage_logs").insert({
        provider,
        model: aiModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost_per_1k: inputCostPer1k,
        total_cost: totalCost,
        company_id: cid,
        conversation_id: conv.id,
      });
      log("📊 Token usage logged:", inputTokens, "in", outputTokens, "out", totalTokens, "total, cost:", totalCost.toFixed(6));
    } catch (e: any) {
      logErr("📊 Failed to log token usage:", e.message);
    }
    
    // Check usage limits and alerts
    try {
      const currentMonth = new Date().toISOString().substring(0, 7);
      let { data: limits } = await sb.from("llm_usage_limits").select("*").eq("company_id", cid).single();
      
      if (!limits) {
        await sb.from("llm_usage_limits").insert({ company_id: cid, current_month: currentMonth });
        limits = { monthly_token_limit: 1000000, alert_50_sent: false, alert_80_sent: false, alert_100_sent: false, current_month: currentMonth };
      }
      
      // Reset alerts if month changed
      if (limits.current_month !== currentMonth) {
        await sb.from("llm_usage_limits").update({ current_month: currentMonth, alert_50_sent: false, alert_80_sent: false, alert_100_sent: false }).eq("company_id", cid);
        limits.alert_50_sent = false;
        limits.alert_80_sent = false;
        limits.alert_100_sent = false;
      }
      
      // Sum monthly usage
      const { data: monthUsage } = await sb.from("llm_usage_logs").select("total_tokens").eq("company_id", cid).gte("created_at", currentMonth + "-01T00:00:00Z");
      const monthTotal = (monthUsage || []).reduce((sum: number, r: any) => sum + (r.total_tokens || 0), 0);
      const pct = (monthTotal / limits.monthly_token_limit) * 100;
      
      if (pct >= 100 && !limits.alert_100_sent) {
        log("🚨 Token limit 100% reached for company:", cid);
        await sb.from("llm_usage_limits").update({ alert_100_sent: true }).eq("company_id", cid);
      } else if (pct >= 80 && !limits.alert_80_sent) {
        log("⚠️ Token limit 80% reached for company:", cid);
        await sb.from("llm_usage_limits").update({ alert_80_sent: true }).eq("company_id", cid);
      } else if (pct >= 50 && !limits.alert_50_sent) {
        log("📊 Token limit 50% reached for company:", cid);
        await sb.from("llm_usage_limits").update({ alert_50_sent: true }).eq("company_id", cid);
      }
    } catch (e: any) {
      logErr("📊 Usage limit check failed:", e.message);
    }
  }

  let txt = ch?.message?.content || "";

  // Track tool results for follow-up AI call
  const toolResults: { tool_call_id: string; name: string; result: string }[] = [];
  let needsFollowUp = false;

  if (ch?.message?.tool_calls) {
    log("🧠 Processing", ch.message.tool_calls.length, "tool calls...");
    for (const tc of ch.message.tool_calls) {
      let args: any = {}; try { args = JSON.parse(tc.function.arguments); } catch {}
      const fn = tc.function.name;
      log("🧠 Tool call:", fn, "args:", JSON.stringify(args));
      let toolResult = "OK";

      if (fn === "confirm_appointment") {
        const { error: upErr } = await sb.from("appointments").update({ status: "confirmed" }).eq("id", args.appointment_id).eq("company_id", cid);
        log("🧠 confirm result:", upErr ? `ERROR: ${upErr.message}` : "OK");
        txt = txt || "Agendamento confirmado! ✅";
      } else if (fn === "cancel_appointment") {
        const { error: upErr } = await sb.from("appointments").update({ status: "canceled" }).eq("id", args.appointment_id).eq("company_id", cid);
        log("🧠 cancel result:", upErr ? `ERROR: ${upErr.message}` : "OK");
        txt = txt || "Agendamento cancelado.";
      } else if (fn === "book_appointment") {
        // Find service to get duration
        const svc = (ctx.svcs || []).find((s: any) => s.id === args.service_id);
        const dur = svc?.duration || 30;
        const p = (args.time || "09:00").split(":").map(Number);
        const em = p[0] * 60 + p[1] + dur;
        const et = String(Math.floor(em / 60)).padStart(2, "0") + ":" + String(em % 60).padStart(2, "0");
        const clientName = conv.client_name || "Cliente WhatsApp";
        const clientPhone = conv.phone.replace(/\D/g, "");

        const insertData: any = {
          company_id: cid,
          service_id: args.service_id,
          appointment_date: args.date,
          start_time: args.time,
          end_time: et,
          client_name: clientName,
          client_phone: clientPhone,
          status: "confirmed",
        };
        if (args.staff_id) insertData.staff_id = args.staff_id;

        const { data: newAppt, error: bookErr } = await sb.from("appointments").insert(insertData).select("id").single();
        log("🧠 book_appointment result:", bookErr ? `ERROR: ${bookErr.message}` : `OK id:${newAppt?.id}`);
        
        if (bookErr) {
          txt = txt || "Desculpe, não consegui criar o agendamento. Tente novamente ou fale com um atendente.";
        } else {
          const staffName = args.staff_id ? (ctx.staff || []).find((s: any) => s.id === args.staff_id)?.name : null;
          txt = txt || `Agendamento criado! ✅ ${svc?.name || "Serviço"} em ${formatDate(args.date)} às ${args.time}${staffName ? " com " + staffName : ""}`;
        }
      } else if (fn === "reschedule_appointment") {
        const { data: ap } = await sb.from("appointments").select("services(duration)").eq("id", args.appointment_id).single();
        const dur = ap?.services?.duration || 30;
        const p = (args.new_time || "09:00").split(":").map(Number);
        const em = p[0] * 60 + p[1] + dur;
        const et = String(Math.floor(em / 60)).padStart(2, "0") + ":" + String(em % 60).padStart(2, "0");
        const { error: upErr } = await sb.from("appointments").update({ appointment_date: args.new_date, start_time: args.new_time, end_time: et, status: "pending" }).eq("id", args.appointment_id).eq("company_id", cid);
        log("🧠 reschedule result:", upErr ? `ERROR: ${upErr.message}` : "OK");
        txt = txt || "Remarcado para " + formatDate(args.new_date) + " " + args.new_time;
      } else if (fn === "check_availability") {
        log("🧠 Checking availability for:", args.date, "staff:", args.staff_id, "service:", args.service_id);
        
        // Real-time sync from Google Calendar before checking availability
        try {
          const syncUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/google-calendar/sync-from-google";
          const syncRes = await fetch(syncUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + Deno.env.get("SUPABASE_ANON_KEY") },
            body: JSON.stringify({ companyId: cid, staffId: args.staff_id || null }),
          });
          const syncData = await syncRes.json();
          log("🧠 Google Calendar sync result:", JSON.stringify(syncData).substring(0, 200));
        } catch (syncErr: any) {
          log("🧠 Google Calendar sync failed (non-fatal):", syncErr.message);
        }

        const dow = new Date(args.date + "T12:00:00").getDay();
        const { data: bh } = await sb.from("business_hours").select("*").eq("company_id", cid).eq("day_of_week", dow).single();
        if (!bh?.is_open) { txt = txt || "Fechado em " + formatDate(args.date); }
        else {
          // Get service duration for proper slot calculation
          const svcDur = args.service_id ? (ctx.svcs || []).find((s: any) => s.id === args.service_id)?.duration : null;
          const iv = ctx.cs?.slot_interval || 30; const mc = ctx.cs?.max_capacity_per_slot || 1;
          
          // Get existing appointments (includes both local and google_calendar source)
          let exQuery = sb.from("appointments").select("start_time, end_time, staff_id").eq("company_id", cid).eq("appointment_date", args.date).in("status", ["pending", "confirmed"]);
          const { data: ex } = await exQuery;
          
          const { data: bl } = await sb.from("time_blocks").select("start_time, end_time, staff_id").eq("company_id", cid).eq("block_date", args.date);
          const tm = (t: string) => { if (!t) return 0; const pp = t.split(":").map(Number); return pp[0] * 60 + pp[1]; };
          let cur = tm(bh.open_time); const end = tm(bh.close_time); const slots: string[] = [];
          const slotDur = svcDur || iv;
          
          while (cur + slotDur <= end) {
            const ss = String(Math.floor(cur / 60)).padStart(2, "0") + ":" + String(cur % 60).padStart(2, "0");
            
            // Check time blocks (filter by staff if specified)
            const blocked = (bl || []).some((x: any) => {
              if (args.staff_id && x.staff_id && x.staff_id !== args.staff_id) return false;
              if (!x.start_time && !x.end_time) return true;
              return cur < tm(x.end_time) && (cur + slotDur) > tm(x.start_time);
            });
            
            if (!blocked) {
              // Check appointment conflicts
              const conflicts = (ex || []).filter((x: any) => {
                if (args.staff_id && x.staff_id && x.staff_id !== args.staff_id) return false;
                return cur < tm(x.end_time) && (cur + slotDur) > tm(x.start_time);
              });
              if (conflicts.length < mc) slots.push(ss);
            }
            cur += iv;
          }
          
          log("🧠 Available slots:", slots.length);
          
          // If staff_id specified, show staff name
          const staffName = args.staff_id ? (ctx.staff || []).find((s: any) => s.id === args.staff_id)?.name : null;
          const dateLabel = formatDate(args.date);
          if (slots.length) {
            // Auto-send slots as interactive menu
            const ws = await getWsCredentials(sb, cid, agentOptions.instanceId);
            if (ws?.active && ws?.base_url && ws?.token) {
              const headerText = `Horários disponíveis ${dateLabel}${staffName ? " com " + staffName : ""} 📅\n\nEscolha um horário:`;
              const topSlots = slots.slice(0, 10);
              try {
                if (topSlots.length <= 3) {
                  // Use buttons for 1-3 options
                  const choices = topSlots.map(s => `${s}|slot_${s.replace(":", "")}`);
                  await sendMenuViaUazapi(
                    { base_url: ws.base_url, token: ws.token },
                    conv.phone.replace(/\D/g, ""),
                    { type: "button", text: headerText, choices, footerText: slots.length > 3 ? `+${slots.length - 3} horários disponíveis` : undefined }
                  );
                  log("🔘 ✅ Slots sent as buttons:", topSlots.length);
                } else {
                  // Use list for 4+ options
                  const choices = topSlots.map(s => `${s}|Horário disponível`);
                  await sendMenuViaUazapi(
                    { base_url: ws.base_url, token: ws.token },
                    conv.phone.replace(/\D/g, ""),
                    { type: "list", text: headerText, choices, title: "Ver horários", footerText: slots.length > 10 ? `Mostrando 10 de ${slots.length} horários` : undefined }
                  );
                  log("🔘 ✅ Slots sent as list:", topSlots.length);
                }
                txt = "__MENU_SENT__";
              } catch (e: any) {
                logErr("🔘 ❌ Auto-menu for slots failed:", e.message);
                // Fallback to text
                txt = txt || `Horários disponíveis ${dateLabel}${staffName ? " com " + staffName : ""}:\n\n${topSlots.map((s, i) => `${i + 1}. ${s}`).join("\n")}${slots.length > 10 ? `\n\n...e mais ${slots.length - 10} horários` : ""}`;
              }
            } else {
              txt = txt || `Horários disponíveis ${dateLabel}${staffName ? " com " + staffName : ""}: ${slots.slice(0, 8).join(", ")}${slots.length > 8 ? " e mais..." : ""}`;
            }
          } else {
            txt = txt || `Sem horários disponíveis em ${dateLabel}${staffName ? " com " + staffName : ""}`;
          }
        }
      } else if (fn === "request_handoff") {
        await sb.from("whatsapp_conversations").update({ handoff_requested: true, status: "handoff" }).eq("id", conv.id);
        txt = txt || "Transferindo para atendente! 🙋";
      } else if (fn === "save_client_name" && args.name) {
        await sb.from("whatsapp_conversations").update({ client_name: args.name }).eq("id", conv.id);
        log("🧠 Client name saved:", args.name);
        toolResult = `Nome "${args.name}" salvo com sucesso.`;
        needsFollowUp = true; // Need AI to continue the conversation after saving name
      } else if (fn === "send_file" && args.file_url) {
        // Send file via UAZAPI
        const ws = await getWsCredentials(sb, cid, agentOptions.instanceId);
        if (ws?.active && ws?.base_url && ws?.token) {
          try {
            const fileType = args.file_type || "document";
            // uazapi v2 uses single /send/media endpoint
            const sendUrl = ws.base_url.replace(/\/$/, "") + "/send/media";
            const sendBody: any = {
              number: conv.phone.replace(/\D/g, ""),
              type: fileType,
              file: args.file_url,
            };
            if (fileType === "document") sendBody.docName = args.file_name;
            if (fileType === "image") sendBody.text = args.file_name;
            
            log("📎 Sending file:", sendUrl, args.file_name);
            const fRes = await fetch(sendUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", token: ws.token },
              body: JSON.stringify(sendBody),
            });
            log("📎 File send result:", fRes.status);
          } catch (e: any) {
            logErr("📎 File send error:", e.message);
          }
        }
        txt = txt || `Enviei o arquivo "${args.file_name}" pra você! 📎`;
      } else if (fn === "send_buttons" || fn === "send_list" || fn === "send_carousel") {
        // Send interactive menu via UAZAPI /send/menu
        const ws = await getWsCredentials(sb, cid, agentOptions.instanceId);
        let menuSentOk = false;
        if (ws?.active && ws?.base_url && ws?.token) {
          try {
            const menuType = fn === "send_buttons" ? "button" : fn === "send_list" ? "list" : "carousel";
            const menuOptions: any = {
              type: menuType as "button" | "list" | "carousel",
              text: args.text,
              choices: args.choices || [],
              footerText: args.footer_text,
              title: args.title,
            };
            if (fn === "send_carousel" && args.cards) {
              menuOptions.cards = args.cards;
            }
            await sendMenuViaUazapi(
              { base_url: ws.base_url, token: ws.token },
              conv.phone.replace(/\D/g, ""),
              menuOptions
            );
            log("🔘 ✅ Menu sent successfully! type:", menuType);
            menuSentOk = true;
            txt = "__MENU_SENT__";
          } catch (e: any) {
            logErr("🔘 ❌ Menu send error:", e.message);
            if (fn === "send_carousel" && args.cards) {
              // Fallback: send cards as text
              const fallbackText = args.text + "\n\n" + args.cards.map((c: any, i: number) => `${i + 1}. *${c.title}*${c.body ? "\n   " + c.body : ""}`).join("\n");
              txt = fallbackText;
            } else {
              const fallbackText = args.text + "\n\n" + (args.choices || []).map((c: string, i: number) => `${i + 1}. ${c.split("|")[0]}`).join("\n");
              txt = fallbackText;
            }
          }
        }
        if (!menuSentOk && !txt) txt = args.text || "";
      }
      toolResults.push({ tool_call_id: tc.id, name: fn, result: toolResult });
      await sb.from("whatsapp_agent_logs").insert({ company_id: cid, conversation_id: conv.id, action: fn, details: args });
    }
  }

  // Follow-up AI call: when tool calls were made but txt is empty (e.g., save_client_name)
  // The AI needs to continue the conversation with the tool results
  if (needsFollowUp && !txt && toolResults.length > 0) {
    log("🧠 Follow-up AI call needed (tool calls produced no text reply)");
    try {
      const followUpMessages = [
        ...messages,
        ch.message, // assistant message with tool_calls
        ...toolResults.map(tr => ({
          role: "tool" as const,
          tool_call_id: tr.tool_call_id,
          content: tr.result,
        })),
      ];
      
      const followUpRes = await fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: requestModel, messages: followUpMessages, [tokenLimitKey]: maxTokens, ...(supportsTemperature ? { temperature, top_p: topP } : {}), ...(providerLabel !== "gemini" && supportsTemperature ? { frequency_penalty: frequencyPenalty, presence_penalty: presencePenalty } : {}) }),
      });
      
      if (followUpRes.ok) {
        const followUpAi = await followUpRes.json();
        const followUpTxt = followUpAi.choices?.[0]?.message?.content || "";
        log("🧠 Follow-up reply:", followUpTxt.substring(0, 150));
        if (followUpTxt) txt = followUpTxt;
        
        // Log follow-up token usage
        const fu = followUpAi.usage;
        if (fu) {
          try {
            let inputCostPer1k2 = 0, outputCostPer1k2 = 0;
            try {
              const { data: pricing2 } = await sb.from("llm_model_pricing").select("input_cost_per_1k, output_cost_per_1k").eq("model", aiModel).eq("active", true).limit(1);
              if (pricing2 && pricing2.length > 0) { inputCostPer1k2 = Number(pricing2[0].input_cost_per_1k) || 0; outputCostPer1k2 = Number(pricing2[0].output_cost_per_1k) || 0; }
            } catch {}
            const totalCost2 = ((fu.prompt_tokens || 0) / 1000 * inputCostPer1k2) + ((fu.completion_tokens || 0) / 1000 * outputCostPer1k2);
            await sb.from("llm_usage_logs").insert({ provider: providerLabel, model: aiModel, input_tokens: fu.prompt_tokens || 0, output_tokens: fu.completion_tokens || 0, total_tokens: fu.total_tokens || 0, cost_per_1k: inputCostPer1k2, total_cost: totalCost2, company_id: cid, conversation_id: conv.id });
          } catch {}
        }
      }
    } catch (e: any) {
      logErr("🧠 Follow-up AI call failed:", e.message);
    }
  }

  const finalReply = txt || "Nao entendi. Digite 'atendente' para falar com alguem.";
  log("🧠 FINAL REPLY:", finalReply.substring(0, 150));
  return finalReply;
}
