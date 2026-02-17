import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callUazapi(
  baseUrl: string,
  endpoint: string,
  method: string,
  tokenHeader: { name: string; value: string },
  body?: Record<string, unknown>
) {
  const url = `${baseUrl}${endpoint}`;
  console.log(`[whatsapp-connect] ➡️  ${method} ${url}`);
  console.log(`[whatsapp-connect]    Header: ${tokenHeader.name}=${tokenHeader.value.substring(0, 8)}...`);
  if (body) console.log(`[whatsapp-connect]    Body: ${JSON.stringify(body)}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [tokenHeader.name]: tokenHeader.value,
  };

  const options: RequestInit = { method, headers };
  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const text = await res.text();
  console.log(`[whatsapp-connect] ⬅️  Status: ${res.status}`);
  console.log(`[whatsapp-connect]    Response: ${text.substring(0, 500)}`);

  let data: any = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    throw { status: res.status, data };
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Invalid token" }, 401);
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
      return jsonResponse({ error: "No company found" }, 404);
    }

    const companyId = profile.company_id;

    let { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    // If no settings row or missing base_url/admin_token, try to copy platform defaults
    if (!settings || !settings.base_url || !settings.admin_token) {
      const { data: platformDefaults } = await supabase
        .from("whatsapp_settings")
        .select("base_url, admin_token")
        .not("base_url", "is", null)
        .not("admin_token", "is", null)
        .neq("company_id", companyId)
        .limit(1)
        .single();

      if (platformDefaults?.base_url && platformDefaults?.admin_token) {
        if (!settings) {
          // Create new settings row with platform defaults
          const { data: newSettings } = await supabase
            .from("whatsapp_settings")
            .insert({
              company_id: companyId,
              base_url: platformDefaults.base_url,
              admin_token: platformDefaults.admin_token,
              active: true,
            })
            .select("*")
            .single();
          settings = newSettings;
        } else {
          // Update existing row with missing fields
          const updates: Record<string, string> = {};
          if (!settings.base_url) updates.base_url = platformDefaults.base_url;
          if (!settings.admin_token) updates.admin_token = platformDefaults.admin_token;
          const { data: updatedSettings } = await supabase
            .from("whatsapp_settings")
            .update(updates)
            .eq("company_id", companyId)
            .select("*")
            .single();
          settings = updatedSettings;
        }
      }
    }

    if (!settings || !settings.base_url) {
      return jsonResponse({ error: "WhatsApp settings not configured. Please set base URL first." }, 400);
    }

    const baseUrl = settings.base_url.replace(/\/$/, "");
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    console.log(`[whatsapp-connect] 🔧 Action: ${action}`);
    console.log(`[whatsapp-connect]    Base URL: ${baseUrl}`);
    console.log(`[whatsapp-connect]    instance_id: ${settings.instance_id || "(none)"}`);
    console.log(`[whatsapp-connect]    Has token: ${!!settings.token}`);
    console.log(`[whatsapp-connect]    Has admin_token: ${!!settings.admin_token}`);

    // ============================================================
    // ACTION: connect — Unified flow:
    //   1. If no instance token, create instance first (POST /instance/init with admintoken)
    //   2. Then connect (POST /instance/connect with instance token)
    // ============================================================
    if (action === "connect") {
      let instanceToken = settings.token;

      // Step 1: Create instance if no token exists
      if (!instanceToken) {
        if (!settings.admin_token) {
          return jsonResponse({
            error: "Admin Token não configurado. Configure-o nas credenciais antes de conectar.",
          }, 400);
        }

        console.log(`[whatsapp-connect] 📦 No instance token — creating new instance...`);

        const instanceName = `instance-${companyId.substring(0, 8)}`;
        const createData = await callUazapi(
          baseUrl,
          "/instance/init",
          "POST",
          { name: "admintoken", value: settings.admin_token },
          { name: instanceName }
        );

        console.log(`[whatsapp-connect] ✅ Instance created:`, JSON.stringify(createData));

        // Extract the new token
        instanceToken = createData?.token;
        const newInstanceId = createData?.instanceId || createData?.instance_id || createData?.name || instanceName;

        if (!instanceToken) {
          console.error(`[whatsapp-connect] ❌ No token returned from /instance/init`);
          return jsonResponse({
            error: "UAZAPI não retornou token ao criar a instância. Verifique o admin token.",
            details: createData,
          }, 500);
        }

        // Save token + instance_id to DB
        console.log(`[whatsapp-connect] 💾 Saving new token and instance_id: ${newInstanceId}`);
        await supabase
          .from("whatsapp_settings")
          .update({ token: instanceToken, instance_id: newInstanceId })
          .eq("company_id", companyId);

        await supabase.from("audit_logs").insert({
          company_id: companyId,
          user_id: userId,
          user_email: userEmail,
          action: "WhatsApp: Criou instância via UAZAPI",
          category: "whatsapp",
          details: { instanceName: newInstanceId, tokenPrefix: instanceToken.substring(0, 8) },
        });
      }

      // Step 2: Connect instance
      console.log(`[whatsapp-connect] 🔗 Connecting instance with token ${instanceToken.substring(0, 8)}...`);

      try {
        const reqBody = await req.json().catch(() => ({}));
        const connectBody: Record<string, string> = {};
        if (reqBody.phone) {
          connectBody.phone = reqBody.phone.replace(/\D/g, "");
        }

        const connectData = await callUazapi(
          baseUrl,
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

        return jsonResponse({ success: true, data: connectData });
      } catch (e: any) {
        console.error(`[whatsapp-connect] ❌ Connect failed:`, JSON.stringify(e?.data || e));

        // If 401 on connect, the token is invalid — clear it so next attempt creates a new instance
        if (e?.status === 401) {
          console.log(`[whatsapp-connect] 🔄 Token invalid, clearing stored token for next attempt...`);
          await supabase
            .from("whatsapp_settings")
            .update({ token: null, instance_id: null })
            .eq("company_id", companyId);

          return jsonResponse({
            error: "Token da instância inválido. A instância foi removida. Clique em Conectar novamente para criar uma nova.",
            needsRetry: true,
          }, 401);
        }

        return jsonResponse(
          { error: `UAZAPI error ${e?.status || 500}`, details: e?.data || {} },
          e?.status || 500
        );
      }

    // ============================================================
    // ACTION: status — Check instance status via GET /instance/status
    // ============================================================
    } else if (action === "status") {
      if (!settings.token) {
        return jsonResponse({ error: "Nenhuma instância configurada.", needsCreate: true }, 400);
      }

      try {
        const data = await callUazapi(
          baseUrl,
          "/instance/status",
          "GET",
          { name: "token", value: settings.token }
        );

        // Auto-configure webhook when instance becomes connected
        const instanceStatus = data?.instance?.status || data?.status;
        const isConnected = instanceStatus === "connected" || data?.instance?.connected === true || data?.connected === true;

        if (isConnected) {
          try {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            // Use wa-webhook proxy to avoid UAZAPI URL-encoding query params as %3F
            const webhookUrl = `${supabaseUrl}/functions/v1/wa-webhook/${companyId}`;

            console.log(`[whatsapp-connect] 🔗 Instance connected! Auto-configuring webhook: ${webhookUrl}`);

            await callUazapi(
              baseUrl,
              "/webhook",
              "POST",
              { name: "token", value: settings.token },
              {
                url: webhookUrl,
                enabled: true,
                events: ["Message"],
              }
            );

            console.log(`[whatsapp-connect] ✅ Webhook configured automatically`);

            // Set presence to available (online) via UAZAPI /send/presence
            try {
              await callUazapi(
                baseUrl,
                "/send/presence",
                "POST",
                { name: "token", value: settings.token },
                { phone: "", presence: "available" }
              );
              console.log(`[whatsapp-connect] ✅ Presence set to available (online)`);
            } catch (presErr: any) {
              console.log(`[whatsapp-connect] ⚠️ Could not set presence via /send/presence:`, presErr?.status);
            }

            await supabase.from("audit_logs").insert({
              company_id: companyId,
              user_id: userId,
              user_email: userEmail,
              action: "WhatsApp: Webhook configurado automaticamente",
              category: "whatsapp",
              details: { webhookUrl },
            });
          } catch (webhookErr: any) {
            // Non-fatal: log but don't fail the status check
            console.error(`[whatsapp-connect] ⚠️ Failed to auto-configure webhook:`, JSON.stringify(webhookErr?.data || webhookErr));
          }
        }

        return jsonResponse({ success: true, data });
      } catch (e: any) {
        // If 401, token is invalid
        if (e?.status === 401) {
          console.log(`[whatsapp-connect] 🔄 Status check: token invalid, clearing...`);
          await supabase
            .from("whatsapp_settings")
            .update({ token: null, instance_id: null })
            .eq("company_id", companyId);

          return jsonResponse({
            error: "Token inválido. Instância removida. Conecte novamente.",
            needsCreate: true,
          }, 400);
        }
        return jsonResponse(
          { error: `UAZAPI error ${e?.status || 500}`, details: e?.data || {} },
          e?.status || 500
        );
      }

    // ============================================================
    // ACTION: disconnect — Disconnect instance via POST /instance/disconnect
    // ============================================================
    } else if (action === "disconnect") {
      if (!settings.token) {
        return jsonResponse({ error: "Token da instância não configurado." }, 400);
      }

      try {
        const data = await callUazapi(
          baseUrl,
          "/instance/disconnect",
          "POST",
          { name: "token", value: settings.token }
        );

        await supabase.from("audit_logs").insert({
          company_id: companyId,
          user_id: userId,
          user_email: userEmail,
          action: "WhatsApp: Desconectou instância",
          category: "whatsapp",
        });

        return jsonResponse({ success: true, data });
      } catch (e: any) {
        return jsonResponse(
          { error: `UAZAPI error ${e?.status || 500}`, details: e?.data || {} },
          e?.status || 500
        );
      }

    // ============================================================
    // ACTION: check-webhook — Check current webhook config via GET /webhook
    // ============================================================
    } else if (action === "check-webhook") {
      if (!settings.token) {
        return jsonResponse({ error: "Token não configurado." }, 400);
      }
      try {
        const data = await callUazapi(
          baseUrl,
          "/webhook",
          "GET",
          { name: "token", value: settings.token }
        );
        return jsonResponse({ success: true, webhook: data });
      } catch (e: any) {
        return jsonResponse({ error: `UAZAPI error`, details: e?.data || {} }, e?.status || 500);
      }

    // ============================================================
    // ACTION: set-webhook — Force reconfigure BOTH instance AND global webhooks
    // ============================================================
    } else if (action === "set-webhook") {
      if (!settings.token) {
        return jsonResponse({ error: "Token não configurado." }, 400);
      }
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const webhookUrl = `${supabaseUrl}/functions/v1/wa-webhook/${companyId}`;
        console.log(`[whatsapp-connect] 🔗 Setting instance webhook to: ${webhookUrl}`);

        // 1. Set INSTANCE webhook (per-instance)
        const data = await callUazapi(
          baseUrl,
          "/webhook",
          "POST",
          { name: "token", value: settings.token },
          { url: webhookUrl, enabled: true, events: ["Message"] }
        );
        console.log(`[whatsapp-connect] ✅ Instance webhook set`);

        // 2. Set GLOBAL webhook via admin token (overrides any old global webhook)
        let globalResult: any = null;
        if (settings.admin_token) {
          // Try multiple possible admin webhook endpoints
          const globalWebhookEndpoints = [
            "/admin/setGlobalWebhook",
            "/admin/globalWebhook", 
            "/admin/webhook",
          ];
          
          for (const endpoint of globalWebhookEndpoints) {
            try {
              console.log(`[whatsapp-connect] 🌐 Trying global webhook via ${endpoint}...`);
              globalResult = await callUazapi(
                baseUrl,
                endpoint,
                "POST",
                { name: "admintoken", value: settings.admin_token },
                { url: webhookUrl, enabled: true, events: ["Message"] }
              );
              console.log(`[whatsapp-connect] ✅ Global webhook set via ${endpoint}`);
              break; // Success, stop trying
            } catch (gErr: any) {
              console.log(`[whatsapp-connect] ⚠️ ${endpoint} failed: ${gErr?.status}`);
            }
          }

          // Also try to GET the current global webhook to see what's configured
          try {
            console.log(`[whatsapp-connect] 🔍 Checking current global webhook...`);
            const currentGlobal = await callUazapi(
              baseUrl,
              "/admin/listGlobalWebhook",
              "GET",
              { name: "admintoken", value: settings.admin_token }
            );
            console.log(`[whatsapp-connect] 📋 Current global webhook:`, JSON.stringify(currentGlobal));
          } catch (checkErr: any) {
            // Try alternative endpoint
            try {
              const currentGlobal2 = await callUazapi(
                baseUrl,
                "/admin/globalWebhook",
                "GET",
                { name: "admintoken", value: settings.admin_token }
              );
              console.log(`[whatsapp-connect] 📋 Current global webhook (alt):`, JSON.stringify(currentGlobal2));
            } catch {
              console.log(`[whatsapp-connect] ⚠️ Could not read global webhook config`);
            }
          }
        }

        await supabase.from("audit_logs").insert({
          company_id: companyId,
          user_id: userId,
          user_email: userEmail,
          action: "WhatsApp: Webhook reconfigurado (instância + global)",
          category: "whatsapp",
          details: { webhookUrl, globalResult },
        });

        return jsonResponse({ success: true, webhookUrl, data, globalResult });
      } catch (e: any) {
        return jsonResponse({ error: `UAZAPI error`, details: e?.data || {} }, e?.status || 500);
      }

    } else {
      return jsonResponse(
        { error: "Invalid action" },
        400
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[whatsapp-connect] 💥 Unhandled error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
