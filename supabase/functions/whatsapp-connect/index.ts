import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user via getClaims
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = (claimsData.claims as any).email as string | undefined;

    // Use service role for DB operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user's company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", userId)
      .single();

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyId = profile.company_id;

    // Fetch WhatsApp settings for this company
    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    if (!settings || !settings.base_url || !settings.token) {
      return new Response(
        JSON.stringify({ error: "WhatsApp settings not configured. Please set base URL and token first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = settings.base_url.replace(/\/$/, "");
    const uazapiToken = settings.token;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Helper to call UAZAPI with proper auth
    async function callUazapi(endpoint: string, method: string, body?: any) {
      const uazapiUrl = `${baseUrl}${endpoint}`;
      console.log(`Calling UAZAPI: ${method} ${uazapiUrl}, token starts with: ${uazapiToken.substring(0, 8)}...`);
      
      // Try with both token header formats for compatibility
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "token": uazapiToken,
        "Authorization": `Bearer ${uazapiToken}`,
      };

      const options: RequestInit = { method, headers };
      if (body && method !== "GET") {
        options.body = JSON.stringify(body);
      }

      const res = await fetch(uazapiUrl, options);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.error(`UAZAPI error: ${res.status}`, JSON.stringify(data));
        throw { status: res.status, data };
      }

      return data;
    }

    if (action === "connect") {
      try {
        const reqBody = await req.json().catch(() => ({}));
        const connectBody: Record<string, string> = {};
        if (reqBody.phone) {
          connectBody.phone = reqBody.phone.replace(/\D/g, "");
        }

        const data = await callUazapi("/instance/connect", "POST", connectBody);

        // Log audit
        await supabase.from("audit_logs").insert({
          company_id: companyId,
          user_id: userId,
          user_email: userEmail,
          action: "WhatsApp: Iniciou conexão via QR code",
          category: "whatsapp",
        });

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        const errStatus = e?.status || 500;
        return new Response(
          JSON.stringify({ error: `UAZAPI error ${errStatus}`, details: e?.data || {} }),
          { status: errStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

    } else if (action === "status") {
      try {
        const data = await callUazapi("/instance/status", "GET");
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        const errStatus = e?.status || 500;
        return new Response(
          JSON.stringify({ error: `UAZAPI error ${errStatus}`, details: e?.data || {} }),
          { status: errStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

    } else if (action === "disconnect") {
      try {
        const data = await callUazapi("/instance/disconnect", "POST");

        await supabase.from("audit_logs").insert({
          company_id: companyId,
          user_id: userId,
          user_email: userEmail,
          action: "WhatsApp: Desconectou instância",
          category: "whatsapp",
        });

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        const errStatus = e?.status || 500;
        return new Response(
          JSON.stringify({ error: `UAZAPI error ${errStatus}`, details: e?.data || {} }),
          { status: errStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use ?action=connect, status, or disconnect" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Edge function error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
