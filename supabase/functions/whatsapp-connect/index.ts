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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
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
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "connect") {
      // POST /instance/connect
      const body = await req.json().catch(() => ({}));
      const connectUrl = `${baseUrl}/instance/connect`;
      
      const connectBody: Record<string, string> = {};
      // If phone is provided, generate paircode instead of QR
      if (body.phone) {
        connectBody.phone = body.phone.replace(/\D/g, "");
      }

      const res = await fetch(connectUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: settings.token,
        },
        body: JSON.stringify(connectBody),
      });

      const data = await res.json().catch(() => null);

      // Log audit
      await supabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        user_email: user.email,
        action: "WhatsApp: Iniciou conexão via QR code",
        category: "whatsapp",
      });

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `UAZAPI error ${res.status}`, details: data }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "status") {
      // GET /instance/status
      const statusUrl = `${baseUrl}/instance/status`;
      
      const res = await fetch(statusUrl, {
        method: "GET",
        headers: {
          token: settings.token,
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `UAZAPI error ${res.status}`, details: data }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "disconnect") {
      // POST /instance/disconnect
      const disconnectUrl = `${baseUrl}/instance/disconnect`;
      
      const res = await fetch(disconnectUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: settings.token,
        },
      });

      const data = await res.json().catch(() => null);

      await supabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        user_email: user.email,
        action: "WhatsApp: Desconectou instância",
        category: "whatsapp",
      });

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use ?action=connect, status, or disconnect" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
