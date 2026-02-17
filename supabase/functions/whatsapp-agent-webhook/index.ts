import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const corsH = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsH });
  }

  const raw = await req.text();
  console.log("[webhook] raw:", raw.substring(0, 400));

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const cid = new URL(req.url).searchParams.get("company_id");
  console.log("[webhook] company_id:", cid);

  return new Response(JSON.stringify({ ok: true, v: 2, cid }), {
    headers: { ...corsH, "Content-Type": "application/json" },
  });
});
