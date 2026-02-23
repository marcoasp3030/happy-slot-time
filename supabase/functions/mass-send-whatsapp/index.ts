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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, campaign_id } = body;

    // ── Action: process-campaign ──
    // Called by cron or manually to process pending campaigns
    if (action === "process-campaigns") {
      // Find campaigns that are scheduled and ready
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
      // Verify caller is authorized
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

      // If scheduled_at is set and in the future, just mark as scheduled
      if (campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()) {
        await supabase.from("mass_campaigns").update({ status: "scheduled" }).eq("id", campaign_id);
        return new Response(JSON.stringify({ ok: true, status: "scheduled" }), { headers: jsonH });
      }

      // Process immediately
      await supabase.from("mass_campaigns").update({ status: "processing", started_at: new Date().toISOString() }).eq("id", campaign_id);
      
      // Process in background (don't await — return immediately)
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

  // Mark as processing
  await supabase.from("mass_campaigns").update({ status: "processing", started_at: campaign.started_at || new Date().toISOString() }).eq("id", campaignId);

  // Get WhatsApp credentials
  const ws = await getWsCredentials(supabase, campaign.company_id, campaign.instance_id);
  if (!ws) {
    log("❌ No WhatsApp credentials for company:", campaign.company_id);
    await supabase.from("mass_campaigns").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", campaignId);
    return;
  }

  // Get pending contacts in batches
  let hasMore = true;
  let sentCount = campaign.sent_count || 0;
  let failedCount = campaign.failed_count || 0;

  while (hasMore) {
    // Check if campaign was cancelled
    const { data: fresh } = await supabase.from("mass_campaigns").select("status").eq("id", campaignId).single();
    if (fresh?.status === "cancelled") {
      log("⚠️ Campaign cancelled, stopping");
      return;
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
      try {
        // Replace {{nome}} placeholder
        const messageText = campaign.message_text.replace(/\{\{nome\}\}/gi, contact.name);

        if (campaign.message_type === "text") {
          await sendText(ws, contact.phone, messageText);
        } else if (campaign.message_type === "button") {
          const buttons = campaign.buttons || [];
          if (buttons.length > 0) {
            await sendMenu(ws, contact.phone, {
              type: "button",
              text: messageText,
              choices: buttons.map((b: any) => `${b.text}|${b.id || b.text}`),
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

        // Mark as sent
        await supabase.from("mass_campaign_contacts").update({
          status: "sent",
          sent_at: new Date().toISOString(),
        }).eq("id", contact.id);

        sentCount++;
        log("✅ Sent to:", contact.phone, `(${sentCount}/${campaign.total_contacts})`);
      } catch (err: any) {
        failedCount++;
        await supabase.from("mass_campaign_contacts").update({
          status: "failed",
          error_message: err.message?.substring(0, 500),
        }).eq("id", contact.id);
        log("❌ Failed for:", contact.phone, err.message);
      }

      // Update progress
      await supabase.from("mass_campaigns").update({ sent_count: sentCount, failed_count: failedCount }).eq("id", campaignId);

      // Delay between messages
      const delay = (campaign.delay_seconds || 10) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Mark as completed
  await supabase.from("mass_campaigns").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    sent_count: sentCount,
    failed_count: failedCount,
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
