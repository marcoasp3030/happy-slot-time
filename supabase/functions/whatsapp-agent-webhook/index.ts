Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const h = { ...cors, "Content-Type": "application/json" };

  const raw = await req.text();
  console.log("[wh] raw:", raw.substring(0, 400));
  const cid = new URL(req.url).searchParams.get("company_id");
  if (!cid) return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: h });

  let b;
  try { b = JSON.parse(raw); } catch { return new Response(JSON.stringify({ ok: true, skipped: "bad_json" }), { headers: h }); }

  const phone = b.phone || b.from || b.data?.from || b.data?.key?.remoteJid?.replace("@s.whatsapp.net", "") || null;
  const msg = b.message || b.text || b.data?.message?.conversation || b.data?.message?.extendedTextMessage?.text || null;
  if (!phone || !msg) return new Response(JSON.stringify({ ok: true, skipped: "no_msg" }), { headers: h });

  console.log("[wh] phone:", phone, "msg:", msg.substring(0, 80));

  const u = Deno.env.get("SUPABASE_URL");
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (u && k) {
    fetch(u + "/functions/v1/wa-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + k },
      body: JSON.stringify({ company_id: cid, phone, message: msg }),
    }).then(async (r) => {
      console.log("[wh] agent:", r.status, (await r.text()).substring(0, 200));
    }).catch((e) => console.error("[wh] err:", e));
  }

  return new Response(JSON.stringify({ ok: true }), { headers: h });
});
