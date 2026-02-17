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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    if (!settings || !settings.base_url) {
      return new Response(
        JSON.stringify({ error: "WhatsApp settings not configured. Please set base URL first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = settings.base_url.replace(/\/$/, "");
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Helper: call UAZAPI with a specific token header
    async function callUazapi(
      endpoint: string,
      method: string,
      tokenHeader: { name: string; value: string },
      body?: any
    ) {
      const uazapiUrl = `${baseUrl}${endpoint}`;
      console.log(`[whatsapp-connect] ${method} ${uazapiUrl} (auth: ${tokenHeader.name})`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        [tokenHeader.name]: tokenHeader.value,
      };

      const options: RequestInit = { method, headers };
      if (body && method !== "GET") {
        options.body = JSON.stringify(body);
      }

      const res = await fetch(uazapiUrl, options);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.error(`[whatsapp-connect] UAZAPI error ${res.status}:`, JSON.stringify(data));
        throw { status: res.status, data };
      }

      return data;
    }

    // Instance token for instance operations (connect, status, disconnect, send)
    const instanceToken = settings.token;
    // Admin token for admin operations (create instance)
    const adminToken = settings.admin_token;

    // ============================================================
    // ACTION: create — Create a new instance via POST /instance/init
    // Uses admintoken header
    // ============================================================
    if (action === "create") {
      if (!adminToken) {
        return new Response(
          JSON.stringify({ error: "Admin Token não configurado. Configure-o nas credenciais." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const reqBody = await req.json().catch(() => ({}));
        const instanceName = reqBody.name || `instance-${companyId.substring(0, 8)}`;

        const data = await callUazapi(
          "/instance/init",
          "POST",
          { name: "admintoken", value: adminToken },
          { name: instanceName }
        );

        // Save the returned instance_id and token
        if (data?.token) {
          await supabase
            .from("whatsapp_settings")
            .update({
              instance_id: data.instanceId || data.instance_id || data.name,
              token: data.token,
            })
            .eq("company_id", companyId);
        }

        await supabase.from("audit_logs").insert({
          company_id: companyId,
          user_id: userId,
          user_email: userEmail,
          action: "WhatsApp: Criou instância via UAZAPI",
          category: "whatsapp",
          details: { instanceName, instanceId: data?.instanceId || data?.name },
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

    // ============================================================
    // ACTION: connect — Connect instance via POST /instance/connect
    // Uses instance token header
    // ============================================================
    } else if (action === "connect") {
      if (!instanceToken) {
        return new Response(
          JSON.stringify({ error: "Token da instância não configurado. Crie uma instância primeiro." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const reqBody = await req.json().catch(() => ({}));
        const connectBody: Record<string, string> = {};
        if (reqBody.phone) {
          connectBody.phone = reqBody.phone.replace(/\D/g, "");
        }

        const data = await callUazapi(
          "/instance/connect",
          "POST",
          { name: "token", value: instanceToken },
          connectBody
        );

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

    // ============================================================
    // ACTION: status — Check instance status via GET /instance/status
    // Uses instance token header
    // ============================================================
    } else if (action === "status") {
      if (!instanceToken) {
        return new Response(
          JSON.stringify({ error: "Token da instância não configurado.", needsCreate: true }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const data = await callUazapi(
          "/instance/status",
          "GET",
          { name: "token", value: instanceToken }
        );
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

    // ============================================================
    // ACTION: disconnect — Disconnect instance via POST /instance/disconnect
    // Uses instance token header
    // ============================================================
    } else if (action === "disconnect") {
      if (!instanceToken) {
        return new Response(
          JSON.stringify({ error: "Token da instância não configurado." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const data = await callUazapi(
          "/instance/disconnect",
          "POST",
          { name: "token", value: instanceToken }
        );

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
        JSON.stringify({ error: "Invalid action. Use ?action=create, connect, status, or disconnect" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[whatsapp-connect] Edge function error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
