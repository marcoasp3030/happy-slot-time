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

      if (!phone || !msg) {
        log("⚠️ No phone or msg found, skipping");
        return new Response(JSON.stringify({ ok: true, skipped: "no_msg" }), { headers: jsonH });
      }

      log("🚀 CALLING handleAgent...");
      const t0 = Date.now();
      try {
        const result = await handleAgent(supabase, uazapiCompanyId, phone, msg);
        const elapsed = Date.now() - t0;
        log("✅ handleAgent completed in", elapsed, "ms, result:", JSON.stringify(result).substring(0, 300));

        await supabase.from("whatsapp_agent_logs").insert({
          company_id: uazapiCompanyId,
          conversation_id: result.conversation_id || null,
          action: "response_sent",
          details: { response_time_ms: elapsed, is_audio: false },
        }).then(() => log("✅ Agent log inserted")).catch((e: any) => logErr("❌ Agent log insert error:", e));

        return new Response(JSON.stringify({ ok: true, ...result }), { headers: jsonH });
      } catch (agentErr: any) {
        logErr("❌ handleAgent THREW:", agentErr.message, agentErr.stack);
        return new Response(JSON.stringify({ error: agentErr.message }), { status: 500, headers: jsonH });
      }
    }

    // ─── Agent processing route (internal call) ───
    if (body.action === "agent-process") {
      log("🔵 agent-process route");
      const result = await handleAgent(supabase, body.company_id, body.phone, body.message);
      return new Response(JSON.stringify(result), { headers: jsonH, status: result.error ? 500 : 200 });
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

// ─── UAZAPI send ───
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

// ─── Split long reply into human-like message chunks ───
function splitIntoHumanMessages(text: string): string[] {
  // First split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  
  const chunks: string[] = [];
  for (const para of paragraphs) {
    // If paragraph is short enough, keep as single message
    if (para.length <= 200) {
      chunks.push(para);
      continue;
    }
    // Split long paragraphs by single newlines
    const lines = para.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      // Group every 2-3 lines together
      let group = "";
      for (const line of lines) {
        if (group && (group + "\n" + line).length > 200) {
          chunks.push(group);
          group = line;
        } else {
          group = group ? group + "\n" + line : line;
        }
      }
      if (group) chunks.push(group);
    } else {
      // Single long line - split by sentences
      const sentences = para.match(/[^.!?]+[.!?]+\s*/g) || [para];
      let group = "";
      for (const s of sentences) {
        if (group && (group + s).length > 200) {
          chunks.push(group.trim());
          group = s;
        } else {
          group += s;
        }
      }
      if (group.trim()) chunks.push(group.trim());
    }
  }
  
  // If nothing was split, return original as single message
  return chunks.length > 0 ? chunks : [text];
}

// ─── Calculate realistic typing delay based on message length ───
function typingDelay(text: string): number {
  // Average reading speed ~40 chars/sec for typing simulation
  // Min 1.5s, max 4s
  const base = Math.max(1500, Math.min(4000, text.length * 50));
  // Add some randomness (±300ms)
  return base + Math.floor(Math.random() * 600) - 300;
}

// ─── Send reply in humanized chunks with typing indicators ───
async function sendHumanizedReply(
  settings: { base_url: string; instance_id: string; token: string },
  phone: string,
  fullReply: string
): Promise<void> {
  const chunks = splitIntoHumanMessages(fullReply);
  log("🗣️ Humanized send:", chunks.length, "chunks for reply of", fullReply.length, "chars");
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Send typing indicator before each message (except first which is immediate)
    if (i > 0) {
      await sendTypingPresence(settings, phone);
      const delay = typingDelay(chunk);
      log("🗣️ Typing delay:", delay, "ms for chunk", i + 1);
      await new Promise(r => setTimeout(r, delay));
    } else {
      // Small initial delay to seem natural
      await sendTypingPresence(settings, phone);
      await new Promise(r => setTimeout(r, 800 + Math.floor(Math.random() * 500)));
    }
    
    await sendUazapiMessage(settings, phone, chunk);
    log("🗣️ Chunk", i + 1, "/", chunks.length, "sent");
  }
}

function formatDate(dateStr: string): string { const [y, m, d] = dateStr.split("-"); return `${d}/${m}/${y}`; }

// ─── AI Agent Logic ───
const DN = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

async function handleAgent(sb: any, cid: string, phone: string, msg: string): Promise<any> {
  log("🤖 handleAgent START cid:", cid, "phone:", phone, "msg:", msg.substring(0, 100));

  if (!cid || !phone || !msg) {
    log("🤖 ❌ Missing fields");
    return { error: "missing fields" };
  }

  // Check agent settings
  log("🤖 Fetching agent settings...");
  const { data: ag, error: agErr } = await sb.from("whatsapp_agent_settings").select("*").eq("company_id", cid).single();
  log("🤖 Agent settings:", ag ? `enabled=${ag.enabled}` : "NOT FOUND", "error:", agErr?.message);
  if (!ag?.enabled) {
    log("🤖 Agent is DISABLED, skipping");
    return { ok: true, skipped: "agent_disabled" };
  }

  // Get/create conversation
  log("🤖 Looking for active conversation...");
  let { data: conv, error: convErr } = await sb.from("whatsapp_conversations").select("*").eq("company_id", cid).eq("phone", phone).eq("status", "active").order("created_at", { ascending: false }).limit(1).single();
  log("🤖 Existing conv:", conv?.id || "NONE", "error:", convErr?.message);

  if (!conv) {
    log("🤖 Creating new conversation...");
    const { data: nc, error: ncErr } = await sb.from("whatsapp_conversations").insert({ company_id: cid, phone, status: "active" }).select().single();
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

  // ── Deduplication: check if same message was already saved in last 15s ──
  const fifteenSecsAgo = new Date(Date.now() - 15000).toISOString();
  const { data: recentDups } = await sb.from("whatsapp_messages")
    .select("id")
    .eq("conversation_id", conv.id)
    .eq("direction", "incoming")
    .eq("content", msg)
    .gte("created_at", fifteenSecsAgo)
    .limit(1);
  
  if (recentDups && recentDups.length > 0) {
    log("🤖 ⚠️ DUPLICATE detected, skipping. Existing msg:", recentDups[0].id);
    return { ok: true, skipped: "duplicate", conversation_id: conv.id };
  }

  // Save incoming message
  log("🤖 Saving incoming message...");
  const { error: msgErr } = await sb.from("whatsapp_messages").insert({ conversation_id: conv.id, company_id: cid, direction: "incoming", message_type: "text", content: msg });
  log("🤖 Message saved:", msgErr ? `ERROR: ${msgErr.message}` : "OK");

  await sb.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

  // Load context
  log("🤖 Loading context...");
  const t1 = Date.now();
  const ctx = await loadCtx(sb, cid, phone, conv.id);
  log("🤖 Context loaded in", Date.now() - t1, "ms. msgs:", ctx.msgs.length, "appts:", ctx.appts.length, "svcs:", ctx.svcs.length, "kb:", ctx.kb.length);

  // Call AI
  log("🤖 Calling AI...");
  const t2 = Date.now();
  try {
    const reply = await callAI(sb, cid, conv, ctx, msg);
    log("🤖 AI reply in", Date.now() - t2, "ms:", reply.substring(0, 150));

    // Save outgoing message
    const { error: outErr } = await sb.from("whatsapp_messages").insert({ conversation_id: conv.id, company_id: cid, direction: "outgoing", message_type: "text", content: reply });
    log("🤖 Outgoing msg saved:", outErr ? `ERROR: ${outErr.message}` : "OK");

    // Send via UAZAPI (humanized: split into chunks with typing delays)
    log("🤖 Fetching WhatsApp settings to send reply...");
    const { data: ws, error: wsErr } = await sb.from("whatsapp_settings").select("base_url, instance_id, token, active").eq("company_id", cid).single();
    log("🤖 WS settings:", ws ? `active=${ws.active} base_url=${ws.base_url}` : "NOT FOUND", "error:", wsErr?.message);

    if (ws?.active && ws?.base_url && ws?.token) {
      try {
        log("🤖 Sending humanized reply via UAZAPI...");
        await sendHumanizedReply(
          { base_url: ws.base_url, instance_id: ws.instance_id || "", token: ws.token },
          phone.replace(/\D/g, ""),
          reply
        );
        log("🤖 ✅ Humanized reply sent successfully!");
      } catch (e: any) {
        logErr("🤖 ❌ Send error:", e.message);
      }
    } else {
      log("🤖 ⚠️ Cannot send: WS inactive or missing credentials");
    }

    return { ok: true, response: reply, conversation_id: conv.id };
  } catch (aiErr: any) {
    logErr("🤖 ❌ AI call FAILED:", aiErr.message, aiErr.stack);
    return { error: aiErr.message, conversation_id: conv.id };
  }
}

async function loadCtx(sb: any, cid: string, ph: string, convId: string) {
  const cp = ph.replace(/\D/g, "");
  const [m, a, c, s, h, k, cs] = await Promise.all([
    sb.from("whatsapp_messages").select("direction, content, created_at").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(20),
    sb.from("appointments").select("id, client_name, appointment_date, start_time, end_time, status, services(name), staff(name)").eq("company_id", cid).or("client_phone.eq." + cp + ",client_phone.eq.+" + cp).in("status", ["pending", "confirmed"]).order("appointment_date", { ascending: true }).limit(10),
    sb.from("companies").select("name, address, phone").eq("id", cid).single(),
    sb.from("services").select("name, duration, price, description").eq("company_id", cid).eq("active", true),
    sb.from("business_hours").select("day_of_week, open_time, close_time, is_open").eq("company_id", cid),
    sb.from("whatsapp_knowledge_base").select("category, title, content").eq("company_id", cid).eq("active", true),
    sb.from("company_settings").select("slot_interval, max_capacity_per_slot, min_advance_hours").eq("company_id", cid).single(),
  ]);
  return { msgs: (m.data || []).reverse(), appts: a.data || [], co: c.data || {}, svcs: s.data || [], hrs: h.data || [], kb: k.data || [], cs: cs.data || {} };
}

async function callAI(sb: any, cid: string, conv: any, ctx: any, userMsg: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  log("🧠 callAI: LOVABLE_API_KEY exists:", !!key, "length:", key?.length);
  if (!key) throw new Error("LOVABLE_API_KEY missing");

  const hrs = (ctx.hrs || []).sort((a: any, b: any) => a.day_of_week - b.day_of_week).map((x: any) => DN[x.day_of_week] + ": " + (x.is_open ? (x.open_time || "").substring(0, 5) + "-" + (x.close_time || "").substring(0, 5) : "Fechado")).join("; ");
  const svcs = (ctx.svcs || []).map((x: any) => x.name + " " + x.duration + "min R$" + (x.price || "?")).join("; ");
  const kbs = (ctx.kb || []).map((x: any) => x.title + ": " + x.content).join("; ");
  const appts = (ctx.appts || []).map((x: any, i: number) => (i + 1) + "." + (x.services?.name || "?") + " " + x.appointment_date + " " + (x.start_time || "").substring(0, 5) + " " + x.status).join("; ");

  const hasHistory = ctx.msgs && ctx.msgs.length > 0;

  const sys = `Você é a atendente virtual de ${ctx.co.name || "nossa empresa"} no WhatsApp.

REGRAS ESSENCIAIS:
- Fale como pessoa real: informal, curta, acolhedora
- Máximo 2-3 frases por resposta
- Emojis com moderação (1-2 por mensagem)
- SEM listas, SEM formatação markdown, SEM negrito/itálico
- Separe assuntos com \\n\\n (enviados como mensagens separadas)
- NÃO repita o que o cliente já sabe ou que já foi dito na conversa

REGRA ANTI-REPETIÇÃO (CRÍTICO):
- ${hasHistory ? "Esta conversa JÁ ESTÁ EM ANDAMENTO. NÃO cumprimente novamente. NÃO diga 'oi', 'olá', 'tudo bem?'. Vá direto ao ponto respondendo a última mensagem." : "Esta é a PRIMEIRA mensagem do cliente. Cumprimente brevemente e pergunte como pode ajudar."}
- NUNCA repita saudações se já houve troca de mensagens
- Se o cliente já disse o nome, NÃO pergunte de novo
- Se já informou horários/serviços, NÃO repita — diga "como mencionei" ou vá direto ao próximo passo
- Analise o histórico antes de responder para não repetir informações

DADOS (use só quando relevante, não despeje tudo de uma vez):
${ctx.co.name || ""} | End: ${ctx.co.address || ""} | Tel: ${ctx.co.phone || ""}
Horários: ${hrs}
Serviços: ${svcs}
${kbs ? "Info extra: " + kbs : ""}
Agendamentos do cliente: ${appts || "nenhum"}`;


  const messages: any[] = [{ role: "system", content: sys }];
  for (const m of ctx.msgs) messages.push({ role: m.direction === "incoming" ? "user" : "assistant", content: m.content || "" });
  messages.push({ role: "user", content: userMsg });

  log("🧠 AI request: model=google/gemini-2.5-flash, messages:", messages.length, "system_len:", sys.length);

  const tools = [
    { type: "function", function: { name: "confirm_appointment", description: "Confirma agendamento", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
    { type: "function", function: { name: "cancel_appointment", description: "Cancela agendamento", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
    { type: "function", function: { name: "check_availability", description: "Horarios disponiveis", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } } },
    { type: "function", function: { name: "reschedule_appointment", description: "Reagenda", parameters: { type: "object", properties: { appointment_id: { type: "string" }, new_date: { type: "string" }, new_time: { type: "string" } }, required: ["appointment_id", "new_date", "new_time"] } } },
    { type: "function", function: { name: "request_handoff", description: "Transfere humano", parameters: { type: "object", properties: {} } } },
  ];

  log("🧠 Sending request to AI gateway...");
  const t0 = Date.now();
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools }),
  });
  log("🧠 AI response status:", r.status, "in", Date.now() - t0, "ms");

  if (!r.ok) {
    const t = await r.text();
    logErr("🧠 ❌ AI ERROR:", r.status, t.substring(0, 500));
    throw new Error("AI " + r.status + ": " + t.substring(0, 200));
  }

  const ai = await r.json();
  const ch = ai.choices?.[0];
  log("🧠 AI finish_reason:", ch?.finish_reason, "has_tool_calls:", !!ch?.message?.tool_calls, "content_len:", ch?.message?.content?.length);

  let txt = ch?.message?.content || "";

  if (ch?.message?.tool_calls) {
    log("🧠 Processing", ch.message.tool_calls.length, "tool calls...");
    for (const tc of ch.message.tool_calls) {
      let args: any = {}; try { args = JSON.parse(tc.function.arguments); } catch {}
      const fn = tc.function.name;
      log("🧠 Tool call:", fn, "args:", JSON.stringify(args));

      if (fn === "confirm_appointment") {
        const { error: upErr } = await sb.from("appointments").update({ status: "confirmed" }).eq("id", args.appointment_id).eq("company_id", cid);
        log("🧠 confirm result:", upErr ? `ERROR: ${upErr.message}` : "OK");
        txt = txt || "Agendamento confirmado! ✅";
      } else if (fn === "cancel_appointment") {
        const { error: upErr } = await sb.from("appointments").update({ status: "canceled" }).eq("id", args.appointment_id).eq("company_id", cid);
        log("🧠 cancel result:", upErr ? `ERROR: ${upErr.message}` : "OK");
        txt = txt || "Agendamento cancelado.";
      } else if (fn === "reschedule_appointment") {
        const { data: ap } = await sb.from("appointments").select("services(duration)").eq("id", args.appointment_id).single();
        const dur = ap?.services?.duration || 30;
        const p = (args.new_time || "09:00").split(":").map(Number);
        const em = p[0] * 60 + p[1] + dur;
        const et = String(Math.floor(em / 60)).padStart(2, "0") + ":" + String(em % 60).padStart(2, "0");
        const { error: upErr } = await sb.from("appointments").update({ appointment_date: args.new_date, start_time: args.new_time, end_time: et, status: "pending" }).eq("id", args.appointment_id).eq("company_id", cid);
        log("🧠 reschedule result:", upErr ? `ERROR: ${upErr.message}` : "OK");
        txt = txt || "Remarcado para " + args.new_date + " " + args.new_time;
      } else if (fn === "check_availability") {
        log("🧠 Checking availability for:", args.date);
        const dow = new Date(args.date + "T12:00:00").getDay();
        const { data: bh } = await sb.from("business_hours").select("*").eq("company_id", cid).eq("day_of_week", dow).single();
        if (!bh?.is_open) { txt = txt || "Fechado em " + args.date; }
        else {
          const iv = ctx.cs?.slot_interval || 30; const mc = ctx.cs?.max_capacity_per_slot || 1;
          const { data: ex } = await sb.from("appointments").select("start_time, end_time").eq("company_id", cid).eq("appointment_date", args.date).in("status", ["pending", "confirmed"]);
          const { data: bl } = await sb.from("time_blocks").select("start_time, end_time").eq("company_id", cid).eq("block_date", args.date);
          const tm = (t: string) => { if (!t) return 0; const pp = t.split(":").map(Number); return pp[0] * 60 + pp[1]; };
          let cur = tm(bh.open_time); const end = tm(bh.close_time); const slots: string[] = [];
          while (cur < end) { const ss = String(Math.floor(cur / 60)).padStart(2, "0") + ":" + String(cur % 60).padStart(2, "0"); const blocked = (bl || []).some((x: any) => (!x.start_time && !x.end_time) || (cur >= tm(x.start_time) && cur < tm(x.end_time))); if (!blocked && (ex || []).filter((x: any) => cur >= tm(x.start_time) && cur < tm(x.end_time)).length < mc) slots.push(ss); cur += iv; }
          log("🧠 Available slots:", slots.length);
          txt = txt || (slots.length ? "Horarios " + args.date + ": " + slots.slice(0, 5).join(", ") : "Sem horarios em " + args.date);
        }
      } else if (fn === "request_handoff") {
        await sb.from("whatsapp_conversations").update({ handoff_requested: true, status: "handoff" }).eq("id", conv.id);
        txt = txt || "Transferindo para atendente! 🙋";
      }
      await sb.from("whatsapp_agent_logs").insert({ company_id: cid, conversation_id: conv.id, action: fn, details: args });
    }
  }

  const finalReply = txt || "Nao entendi. Digite 'atendente' para falar com alguem.";
  log("🧠 FINAL REPLY:", finalReply.substring(0, 150));
  return finalReply;
}
