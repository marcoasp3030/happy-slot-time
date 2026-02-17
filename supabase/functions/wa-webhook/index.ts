const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function log(...args: any[]) {
  console.log("[wa-webhook]", new Date().toISOString(), ...args);
}

function extractMessageText(body: any): string | null {
  // Direct string fields
  if (typeof body.message === "string") return body.message;
  if (typeof body.text === "string") return body.text;

  // UAZAPI format: message is an object with conversation or extendedTextMessage
  const msg = body.message;
  if (msg && typeof msg === "object") {
    if (typeof msg.conversation === "string") return msg.conversation;
    if (typeof msg.extendedTextMessage?.text === "string") return msg.extendedTextMessage.text;
    if (typeof msg.imageMessage?.caption === "string") return msg.imageMessage.caption;
    if (typeof msg.videoMessage?.caption === "string") return msg.videoMessage.caption;
    if (typeof msg.documentMessage?.caption === "string") return msg.documentMessage.caption;
    // If message object exists but no text found, try to get any text
    if (typeof msg.body === "string") return msg.body;
    if (typeof msg.text === "string") return msg.text;
  }

  // UAZAPI nested data format
  const data = body.data;
  if (data) {
    if (typeof data.message === "string") return data.message;
    if (data.message && typeof data.message === "object") {
      if (typeof data.message.conversation === "string") return data.message.conversation;
      if (typeof data.message.extendedTextMessage?.text === "string") return data.message.extendedTextMessage.text;
    }
  }

  // UAZAPI chat-level message text
  if (typeof body.chat?.lastMessage === "string") return body.chat.lastMessage;
  if (typeof body.chat?.last_message === "string") return body.chat.last_message;

  // Try body.msg
  if (typeof body.msg === "string") return body.msg;

  return null;
}

function extractPhone(body: any): string | null {
  // Direct fields
  if (body.phone) return String(body.phone);
  if (body.from) return String(body.from);

  // UAZAPI: chat.id contains the remote JID like "rcabfb84df806a4"
  // but the actual phone might be in key.remoteJid
  if (body.key?.remoteJid) {
    return body.key.remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  }

  // UAZAPI: data.key.remoteJid
  if (body.data?.key?.remoteJid) {
    return body.data.key.remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  }

  // UAZAPI: chat.id might be internal, but chat.jid or chat.phone
  if (body.chat?.phone) return String(body.chat.phone);
  if (body.chat?.jid) {
    return body.chat.jid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  }

  // UAZAPI: remoteJid at top level
  if (body.remoteJid) {
    return body.remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  }

  // data.from
  if (body.data?.from) return String(body.data.from);

  return null;
}

function isFromMe(body: any): boolean {
  if (body.fromMe === true) return true;
  if (body.data?.fromMe === true) return true;
  if (body.key?.fromMe === true) return true;
  if (body.data?.key?.fromMe === true) return true;
  // UAZAPI: event.IsFromMe
  if (body.event?.IsFromMe === true) return true;
  // UAZAPI: message object has fromMe directly (most common UAZAPI format)
  if (body.message?.fromMe === true) return true;
  // UAZAPI: message sent via API
  if (body.message?.wasSentByApi === true) return true;
  // UAZAPI: check if sender matches the instance owner (business number)
  const owner = body.owner;
  if (owner) {
    const phone = extractPhone(body);
    if (phone && owner.replace(/\D/g, "") === phone.replace(/\D/g, "")) return true;
  }
  // UAZAPI: message sent by instance has "fromMe" in nested message key
  if (body.message?.key?.fromMe === true) return true;
  return false;
}

Deno.serve(async (req) => {
  log("🔵 REQUEST:", req.method, req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // Extract company_id from PATH: /wa-webhook/{company_id}
    const pathParts = url.pathname.split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    const companyId = (lastPart && lastPart !== "wa-webhook") 
      ? lastPart 
      : url.searchParams.get("company_id");

    log("🔵 company_id:", companyId, "path:", url.pathname);

    if (!companyId) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "no_company_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const raw = await req.text();
    log("🔵 Raw body (1000):", raw.substring(0, 1000));

    let body: any;
    try { body = JSON.parse(raw); } catch {
      return new Response(
        JSON.stringify({ ok: true, skipped: "bad_json" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the EventType and key structure for debugging
    log("🔵 EventType:", body.EventType, "keys:", Object.keys(body).join(","));
    if (body.key) log("🔵 key:", JSON.stringify(body.key));
    if (body.message) log("🔵 message type:", typeof body.message, "keys:", body.message && typeof body.message === "object" ? Object.keys(body.message).join(",") : "N/A");

    // Skip non-message events (chats updates, status, etc.)
    const eventType = body.EventType || body.eventType || body.event;
    if (eventType && eventType !== "messages" && eventType !== "message" && eventType !== "Message") {
      log("📩 Skipping non-message event:", eventType);
      return new Response(
        JSON.stringify({ ok: true, skipped: "non_message_event", eventType }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log fromMe detection details
    log("🔵 fromMe check:", 
      "body.fromMe:", body.fromMe, 
      "key.fromMe:", body.key?.fromMe,
      "msg.fromMe:", body.message?.fromMe,
      "msg.wasSentByApi:", body.message?.wasSentByApi,
      "event.IsFromMe:", body.event?.IsFromMe,
      "owner:", body.owner
    );

    if (isFromMe(body)) {
      log("📩 Skipping fromMe");
      return new Response(
        JSON.stringify({ ok: true, skipped: "from_me" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phone = extractPhone(body);
    const msg = extractMessageText(body);

    log("📩 phone:", phone, "msg:", msg?.substring(0, 100));

    if (!phone || !msg) {
      log("⚠️ Could not extract phone/msg. Full body keys:", JSON.stringify(Object.keys(body)));
      // Log more details to help debug
      if (body.chat) log("⚠️ chat keys:", Object.keys(body.chat).join(","));
      return new Response(
        JSON.stringify({ ok: true, skipped: "no_msg", phone, hasMsg: !!msg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Forward to send-whatsapp
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const forwardUrl = `${supabaseUrl}/functions/v1/send-whatsapp`;
    log("🚀 Forwarding to:", forwardUrl);

    const res = await fetch(forwardUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        action: "agent-process",
        company_id: companyId,
        phone,
        message: msg,
      }),
    });

    const result = await res.text();
    log("✅ Result:", res.status, result.substring(0, 300));

    return new Response(result, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    log("❌ ERROR:", e.message);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
