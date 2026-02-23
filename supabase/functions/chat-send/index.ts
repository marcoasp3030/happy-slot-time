import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const h = { ...cors, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: h });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await sb.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: h });
    }
    const userId = claimsData.claims.sub;

    // Get user's company
    const { data: profile } = await sb.from("profiles").select("company_id").eq("user_id", userId).single();
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company found" }), { status: 400, headers: h });
    }
    const companyId = profile.company_id;

    const body = await req.json();
    const { action } = body;

    // Use service role for DB writes and API calls
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (action === "send-text") {
      const { phone, message, conversation_id, instance_id } = body;
      if (!phone || !message) return new Response(JSON.stringify({ error: "phone and message required" }), { status: 400, headers: h });

      const creds = await getCredentials(admin, companyId, instance_id);
      if (!creds) return new Response(JSON.stringify({ error: "WhatsApp not configured" }), { status: 400, headers: h });

      // Send via UAZAPI
      const url = creds.base_url.replace(/\/$/, "") + "/send/text";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: creds.token },
        body: JSON.stringify({ number: phone, text: message }),
      });
      const result = await res.text();
      if (!res.ok) return new Response(JSON.stringify({ error: `Send failed: ${result}` }), { status: 500, headers: h });

      let waMessageId: string | null = null;
      try {
        const parsed = JSON.parse(result);
        waMessageId = parsed?.key?.id || parsed?.id || parsed?.messageId || null;
      } catch {}

      // Get or create conversation
      let convId = conversation_id;
      if (!convId) {
        let convQuery = admin.from("whatsapp_conversations").select("id").eq("company_id", companyId).eq("phone", phone).eq("status", "active").order("created_at", { ascending: false }).limit(1);
        if (instance_id) convQuery = convQuery.eq("instance_id", instance_id);
        const { data: existingConv } = await convQuery.single();
        if (existingConv) {
          convId = existingConv.id;
        } else {
          const newConv: any = { company_id: companyId, phone, status: "active" };
          if (instance_id) newConv.instance_id = instance_id;
          const { data: nc } = await admin.from("whatsapp_conversations").insert(newConv).select("id").single();
          convId = nc?.id;
        }
      }

      // Update conversation timestamp
      if (convId) {
        await admin.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convId);
      }

      // Save message
      const { data: savedMsg } = await admin.from("whatsapp_messages").insert({
        conversation_id: convId,
        company_id: companyId,
        direction: "outgoing",
        message_type: "text",
        content: message,
        delivery_status: "sent",
        wa_message_id: waMessageId,
      }).select("*").single();

      return new Response(JSON.stringify({ ok: true, message: savedMsg }), { headers: h });
    }

    if (action === "send-media") {
      const { phone, media_url, media_type, caption, conversation_id, instance_id } = body;
      if (!phone || !media_url) return new Response(JSON.stringify({ error: "phone and media_url required" }), { status: 400, headers: h });

      const creds = await getCredentials(admin, companyId, instance_id);
      if (!creds) return new Response(JSON.stringify({ error: "WhatsApp not configured" }), { status: 400, headers: h });

      const url = creds.base_url.replace(/\/$/, "") + "/send/media";
      const payload: any = { number: phone, type: media_type || "image", file: media_url };
      if (caption) payload.text = caption;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: creds.token },
        body: JSON.stringify(payload),
      });
      const result = await res.text();
      if (!res.ok) return new Response(JSON.stringify({ error: `Send failed: ${result}` }), { status: 500, headers: h });

      let waMessageId: string | null = null;
      try { const p = JSON.parse(result); waMessageId = p?.key?.id || p?.id || null; } catch {}

      // Get or create conversation
      let convId = conversation_id;
      if (!convId) {
        let cq = admin.from("whatsapp_conversations").select("id").eq("company_id", companyId).eq("phone", phone).eq("status", "active").order("created_at", { ascending: false }).limit(1);
        if (instance_id) cq = cq.eq("instance_id", instance_id);
        const { data: ec } = await cq.single();
        convId = ec?.id || null;
        if (!convId) {
          const nd: any = { company_id: companyId, phone, status: "active" };
          if (instance_id) nd.instance_id = instance_id;
          const { data: nc } = await admin.from("whatsapp_conversations").insert(nd).select("id").single();
          convId = nc?.id;
        }
      }

      if (convId) {
        await admin.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convId);
      }

      const { data: savedMsg } = await admin.from("whatsapp_messages").insert({
        conversation_id: convId,
        company_id: companyId,
        direction: "outgoing",
        message_type: media_type || "image",
        content: caption || null,
        media_url,
        delivery_status: "sent",
        wa_message_id: waMessageId,
      }).select("*").single();

      return new Response(JSON.stringify({ ok: true, message: savedMsg }), { headers: h });
    }

    if (action === "send-reaction") {
      const { phone, emoji, wa_message_id, instance_id } = body;
      if (!phone || !emoji || !wa_message_id) return new Response(JSON.stringify({ error: "phone, emoji and wa_message_id required" }), { status: 400, headers: h });

      const creds = await getCredentials(admin, companyId, instance_id);
      if (!creds) return new Response(JSON.stringify({ error: "WhatsApp not configured" }), { status: 400, headers: h });

      const url = creds.base_url.replace(/\/$/, "") + "/send/reaction";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: creds.token },
        body: JSON.stringify({ phone, messageId: wa_message_id, reaction: emoji }),
      });
      const result = await res.text();

      return new Response(JSON.stringify({ ok: res.ok, result }), { headers: h });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: h });
  } catch (e: any) {
    console.error("[chat-send] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: h });
  }
});

async function getCredentials(sb: any, companyId: string, instanceId?: string) {
  const { data: ws } = await sb.from("whatsapp_settings").select("base_url, instance_id, token, active").eq("company_id", companyId).maybeSingle();
  const baseUrl = ws?.base_url || "https://sistembr.uazapi.com";

  if (instanceId) {
    const { data: inst } = await sb.from("whatsapp_instances").select("instance_name, token, status").eq("id", instanceId).eq("company_id", companyId).maybeSingle();
    if (inst?.token) return { base_url: baseUrl, instance_id: inst.instance_name, token: inst.token };
    if (ws?.token) return { base_url: baseUrl, instance_id: inst?.instance_name || ws.instance_id, token: ws.token };
  }

  if (ws?.token && ws?.instance_id) return { base_url: baseUrl, instance_id: ws.instance_id, token: ws.token };
  return null;
}
