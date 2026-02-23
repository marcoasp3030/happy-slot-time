import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const jsonH = { ...corsHeaders, "Content-Type": "application/json" };

function log(...args: any[]) {
  console.log("[mass-send]", new Date().toISOString(), ...args);
}

/** Returns a random integer between min and max (inclusive) */
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Check if current time is within business hours (8h-20h in campaign timezone, defaults to America/Sao_Paulo) */
function isBusinessHours(): boolean {
  const now = new Date();
  // Use Brazil timezone offset (UTC-3) as default
  const brOffset = -3;
  const utcHours = now.getUTCHours();
  const localHours = (utcHours + brOffset + 24) % 24;
  return localHours >= 8 && localHours < 20;
}

/** Check if today is a weekday (Mon-Fri) */
function isWeekday(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  return day >= 1 && day <= 5;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, campaign_id } = body;

    // ── Action: process-campaigns ──
    if (action === "process-campaigns") {
      const now = new Date().toISOString();
      const { data: campaigns } = await supabase
        .from("mass_campaigns")
        .select("*")
        .in("status", ["scheduled", "processing"])
        .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
        .order("created_at", { ascending: true })
        .limit(5);

      if (!campaigns || campaigns.length === 0) {
        return new Response(JSON.stringify({ ok: true, message: "No campaigns to process" }), { headers: jsonH });
      }

      for (const campaign of campaigns) {
        await processCampaign(supabase, campaign);
      }

      return new Response(JSON.stringify({ ok: true, processed: campaigns.length }), { headers: jsonH });
    }

    // ── Action: start-campaign ──
    if (action === "start-campaign" && campaign_id) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const callerClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await callerClient.auth.getUser();
        if (!user) {
          return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonH });
        }
      }

      const { data: campaign } = await supabase
        .from("mass_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .single();

      if (!campaign) {
        return new Response(JSON.stringify({ error: "Campanha não encontrada" }), { status: 404, headers: jsonH });
      }

      if (campaign.status !== "draft" && campaign.status !== "scheduled") {
        return new Response(JSON.stringify({ error: "Campanha já iniciada ou finalizada" }), { status: 400, headers: jsonH });
      }

      if (campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()) {
        await supabase.from("mass_campaigns").update({ status: "scheduled" }).eq("id", campaign_id);
        return new Response(JSON.stringify({ ok: true, status: "scheduled" }), { headers: jsonH });
      }

      await supabase.from("mass_campaigns").update({ status: "processing", started_at: new Date().toISOString() }).eq("id", campaign_id);

      processCampaign(supabase, { ...campaign, status: "processing" }).catch(err => {
        log("❌ Background campaign processing error:", err);
      });

      return new Response(JSON.stringify({ ok: true, status: "processing" }), { headers: jsonH });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: jsonH });
  } catch (err: any) {
    log("❌ Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: jsonH });
  }
});

async function processCampaign(supabase: any, campaign: any) {
  const campaignId = campaign.id;
  log("🚀 Processing campaign:", campaignId, "name:", campaign.name);

  // Anti-ban settings
  const delayMin = campaign.delay_min || 8;
  const delayMax = campaign.delay_max || 25;
  const dailyLimit = campaign.daily_limit || 300;
  const businessHoursOnly = campaign.business_hours_only ?? true;
  const rotateInstances = campaign.rotate_instances ?? false;

  await supabase.from("mass_campaigns").update({
    status: "processing",
    started_at: campaign.started_at || new Date().toISOString(),
  }).eq("id", campaignId);

  // Get all available instances for rotation
  let instances: any[] = [];
  if (rotateInstances) {
    const { data: allInstances } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, token, status")
      .eq("company_id", campaign.company_id)
      .eq("status", "connected");
    instances = allInstances || [];
  }

  // Get primary WhatsApp credentials
  const primaryWs = await getWsCredentials(supabase, campaign.company_id, campaign.instance_id);
  if (!primaryWs && instances.length === 0) {
    log("❌ No WhatsApp credentials for company:", campaign.company_id);
    await supabase.from("mass_campaigns").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", campaignId);
    return;
  }

  // Build rotation list
  const wsPool: { base_url: string; instance_id: string; token: string }[] = [];
  if (primaryWs) wsPool.push(primaryWs);
  if (rotateInstances && instances.length > 0) {
    const baseUrl = primaryWs?.base_url;
    if (baseUrl) {
      for (const inst of instances) {
        if (inst.token && !wsPool.find(w => w.instance_id === inst.instance_name)) {
          wsPool.push({ base_url: baseUrl, instance_id: inst.instance_name, token: inst.token });
        }
      }
    }
  }

  if (wsPool.length === 0) {
    log("❌ No valid WhatsApp instances available");
    await supabase.from("mass_campaigns").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", campaignId);
    return;
  }

  let hasMore = true;
  let sentCount = campaign.sent_count || 0;
  let failedCount = campaign.failed_count || 0;

  // Track daily sent count
  const today = new Date().toISOString().split("T")[0];
  let dailySent = campaign.last_sent_date === today ? (campaign.daily_sent_count || 0) : 0;

  let instanceIndex = 0;

  while (hasMore) {
    // Check if campaign was cancelled
    const { data: fresh } = await supabase.from("mass_campaigns").select("status").eq("id", campaignId).single();
    if (fresh?.status === "cancelled") {
      log("⚠️ Campaign cancelled, stopping");
      return;
    }

    // ── Anti-ban: Business hours check ──
    if (businessHoursOnly && (!isBusinessHours() || !isWeekday())) {
      log("⏸️ Outside business hours, pausing campaign until next window");
      await supabase.from("mass_campaigns").update({
        sent_count: sentCount,
        failed_count: failedCount,
        daily_sent_count: dailySent,
        last_sent_date: today,
      }).eq("id", campaignId);
      // Wait 15 minutes and recheck
      await new Promise(r => setTimeout(r, 15 * 60 * 1000));
      continue;
    }

    // ── Anti-ban: Daily limit check ──
    if (dailySent >= dailyLimit) {
      log(`⏸️ Daily limit reached (${dailySent}/${dailyLimit}), pausing until tomorrow`);
      await supabase.from("mass_campaigns").update({
        sent_count: sentCount,
        failed_count: failedCount,
        daily_sent_count: dailySent,
        last_sent_date: today,
      }).eq("id", campaignId);
      // Wait 1 hour and recheck (date will change eventually)
      await new Promise(r => setTimeout(r, 60 * 60 * 1000));
      // Reset daily counter if date changed
      const newToday = new Date().toISOString().split("T")[0];
      if (newToday !== today) {
        dailySent = 0;
      }
      continue;
    }

    const { data: contacts } = await supabase
      .from("mass_campaign_contacts")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20);

    if (!contacts || contacts.length === 0) {
      hasMore = false;
      break;
    }

    for (const contact of contacts) {
      // Recheck daily limit inside loop
      if (dailySent >= dailyLimit) {
        log(`⏸️ Daily limit hit mid-batch, breaking`);
        break;
      }

      // Recheck business hours every 10 messages
      if (businessHoursOnly && dailySent % 10 === 0 && dailySent > 0) {
        if (!isBusinessHours() || !isWeekday()) {
          log("⏸️ Business hours ended mid-batch, breaking");
          break;
        }
      }

      // ── Anti-ban: Rotate instance ──
      const ws = wsPool[instanceIndex % wsPool.length];
      if (rotateInstances) {
        instanceIndex++;
      }

      try {
        const messageText = campaign.message_text.replace(/\{\{nome\}\}/gi, contact.name);

        // Send all media files (multiple file support)
        const mediaFiles: { url: string; type: string; name: string }[] = campaign.media_files || [];
        
        // Fallback: if media_files is empty but media_url exists (legacy), use single file
        if (mediaFiles.length === 0 && campaign.media_url && campaign.media_type) {
          mediaFiles.push({ url: campaign.media_url, type: campaign.media_type, name: 'arquivo' });
        }

        if (mediaFiles.length > 0) {
          // Send first media with caption (message text), rest without caption
          for (let mi = 0; mi < mediaFiles.length; mi++) {
            const mf = mediaFiles[mi];
            const caption = mi === 0 ? messageText : undefined;
            await sendMedia(ws, contact.phone, mf.url, mf.type, caption, mf.name);
            // Small delay between multiple files
            if (mi < mediaFiles.length - 1) {
              await new Promise(r => setTimeout(r, randomDelay(1, 3) * 1000));
            }
          }
        } else if (campaign.message_type === "text") {
          await sendText(ws, contact.phone, messageText);
        } else if (campaign.message_type === "button") {
          const btns = campaign.buttons || [];
          if (btns.length > 0) {
            await sendMenu(ws, contact.phone, {
              type: "button",
              text: messageText,
              choices: btns.map((b: any) => `${b.text}|${b.id || b.text}`),
              footerText: campaign.footer_text || undefined,
            });
          } else {
            await sendText(ws, contact.phone, messageText);
          }
        } else if (campaign.message_type === "list") {
          const sections = campaign.list_sections || [];
          const allChoices: string[] = [];
          for (const section of sections) {
            for (const item of section.items || []) {
              allChoices.push(`${item.title}|${item.id || item.title}`);
            }
          }
          if (allChoices.length > 0) {
            await sendMenu(ws, contact.phone, {
              type: "list",
              text: messageText,
              choices: allChoices,
              title: sections[0]?.title || "Opções",
              footerText: campaign.footer_text || undefined,
            });
          } else {
            await sendText(ws, contact.phone, messageText);
          }
        }

        await supabase.from("mass_campaign_contacts").update({
          status: "sent",
          sent_at: new Date().toISOString(),
        }).eq("id", contact.id);

        sentCount++;
        dailySent++;
        log(`✅ Sent to: ${contact.phone} (${sentCount}/${campaign.total_contacts}) via ${ws.instance_id}`);

        // ── Trigger linked automation flow (fire-and-forget) ──
        try {
          // Check if this campaign has a linked automation flow
          const { data: linkedFlow } = await supabase
            .from("automation_flows")
            .select("id")
            .eq("campaign_id", campaignId)
            .eq("active", true)
            .maybeSingle();

          if (linkedFlow) {
            const autoUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-automations`;
            fetch(autoUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                event_type: "text_reply",
                company_id: campaign.company_id,
                phone: contact.phone,
                contact_name: contact.name,
                value: campaign.message_text.replace(/\{\{nome\}\}/gi, contact.name),
                instance_id: campaign.instance_id || null,
                campaign_id: campaignId,
                flow_id: linkedFlow.id,
              }),
            }).catch((e: any) => log("⚠️ Automation trigger error (ignored):", e.message));
          }
        } catch (autoErr: any) {
          log("⚠️ Automation lookup error (ignored):", autoErr.message);
        }
      } catch (err: any) {
        failedCount++;
        await supabase.from("mass_campaign_contacts").update({
          status: "failed",
          error_message: err.message?.substring(0, 500),
        }).eq("id", contact.id);
        log("❌ Failed for:", contact.phone, err.message);
      }

      // Update progress
      await supabase.from("mass_campaigns").update({
        sent_count: sentCount,
        failed_count: failedCount,
        daily_sent_count: dailySent,
        last_sent_date: new Date().toISOString().split("T")[0],
      }).eq("id", campaignId);

      // ── Anti-ban: Random delay ──
      const delaySec = randomDelay(delayMin, delayMax);
      log(`⏳ Waiting ${delaySec}s before next message`);
      await new Promise(r => setTimeout(r, delaySec * 1000));
    }
  }

  await supabase.from("mass_campaigns").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    sent_count: sentCount,
    failed_count: failedCount,
    daily_sent_count: dailySent,
    last_sent_date: new Date().toISOString().split("T")[0],
  }).eq("id", campaignId);

  log("🏁 Campaign completed:", campaignId, "sent:", sentCount, "failed:", failedCount);
}

// ─── WhatsApp helpers ───

async function getWsCredentials(sb: any, companyId: string, instanceId?: string | null) {
  const { data: ws } = await sb.from("whatsapp_settings").select("base_url, token, instance_id").eq("company_id", companyId).maybeSingle();
  const baseUrl = ws?.base_url;
  if (!baseUrl) return null;

  if (instanceId) {
    const { data: inst } = await sb.from("whatsapp_instances").select("instance_name, token, status").eq("id", instanceId).maybeSingle();
    if (inst?.token) {
      return { base_url: baseUrl, instance_id: inst.instance_name, token: inst.token };
    }
  }

  if (ws?.token) {
    return { base_url: baseUrl, instance_id: ws.instance_id || "default", token: ws.token };
  }

  return null;
}

async function sendText(ws: { base_url: string; token: string }, phone: string, text: string) {
  const url = ws.base_url.replace(/\/$/, "") + "/send/text";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: ws.token },
    body: JSON.stringify({ number: phone, text }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Send error ${res.status}: ${errText.substring(0, 200)}`);
  }
}

async function sendMedia(
  ws: { base_url: string; token: string },
  phone: string,
  mediaUrl: string,
  mediaType: string,
  caption?: string,
  fileName?: string
) {
  // uazapi v2 uses single /send/media endpoint with "type" field
  const url = ws.base_url.replace(/\/$/, "") + "/send/media";
  const body: any = {
    number: phone,
    type: mediaType === "audio" ? "audio" : mediaType === "document" ? "document" : "image",
    file: mediaUrl,
  };
  if (caption && mediaType !== "audio") body.text = caption;
  if (mediaType === "document" && fileName) body.docName = fileName;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: ws.token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Media error ${res.status}: ${errText.substring(0, 200)}`);
  }
}

async function sendMenu(
  ws: { base_url: string; token: string },
  phone: string,
  options: { type: string; text: string; choices: string[]; title?: string; footerText?: string }
) {
  const url = ws.base_url.replace(/\/$/, "") + "/send/menu";
  const body: any = {
    number: phone,
    type: options.type,
    text: options.text,
    choices: options.choices,
  };
  if (options.footerText) body.footerText = options.footerText;
  if (options.title) body.title = options.title;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: ws.token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Menu error ${res.status}: ${errText.substring(0, 200)}`);
  }
}
