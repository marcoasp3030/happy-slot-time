import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const raw = await req.text();
  console.log("[wh-recv] raw:", raw.substring(0, 400));

  const cid = new URL(req.url).searchParams.get("company_id");
  if (!cid) {
    return new Response(JSON.stringify({ error: "company_id required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let b: any;
  try { b = JSON.parse(raw); } catch {
    return new Response(JSON.stringify({ ok: true, skipped: "invalid_json" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const phone = b.phone || b.from || b.data?.from || b.data?.key?.remoteJid?.replace("@s.whatsapp.net", "") || null;
  const msg = b.message || b.text || b.data?.message?.conversation || b.data?.message?.extendedTextMessage?.text || null;

  if (!phone || !msg) {
    console.log("[wh-recv] no phone/msg, skipping");
    return new Response(JSON.stringify({ ok: true, skipped: "no_message" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  console.log("[wh-recv] from:", phone, "msg:", msg.substring(0, 80));

  try {
    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    fetch(`${sbUrl}/functions/v1/wa-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sbKey}` },
      body: JSON.stringify({ company_id: cid, phone, message: msg }),
    }).then(async (r) => {
      const t = await r.text();
      console.log("[wh-recv] wa-agent:", r.status, t.substring(0, 200));
    }).catch((e) => console.error("[wh-recv] err:", e));
  } catch (e: any) {
    console.error("[wh-recv] call error:", e);
  }

  return new Response(JSON.stringify({ ok: true, received: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
