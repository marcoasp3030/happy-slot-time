Deno.serve(async (req) => {
  const h = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  try {
    const raw = await req.text();
    console.log("[wa-proxy] raw:", raw.substring(0, 300));
    const b = JSON.parse(raw);
    const cid = b.company_id || new URL(req.url).searchParams.get("company_id");
    const phone = b.phone || b.from || b.data?.from || b.data?.key?.remoteJid?.replace("@s.whatsapp.net", "") || null;
    const msg = b.message || b.text || b.data?.message?.conversation || b.data?.message?.extendedTextMessage?.text || null;
    if (!cid || !phone || !msg) return new Response(JSON.stringify({ ok: true, skipped: "no_msg" }), { headers: h });
    const u = Deno.env.get("SUPABASE_URL");
    const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const r = await fetch(u + "/functions/v1/send-whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + k },
      body: JSON.stringify({ action: "agent-process", company_id: cid, phone, message: msg }),
    });
    const result = await r.text();
    console.log("[wa-proxy] result:", r.status, result.substring(0, 200));
    return new Response(result, { status: r.status, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: h });
  }
});
