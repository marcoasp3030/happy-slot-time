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

    // Fetch base whatsapp_settings (platform credentials)
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
    // instanceId param used for multi-instance operations
    const instanceId = url.searchParams.get("instanceId");

    console.log(`[whatsapp-connect] 🔧 Action: ${action}, instanceId: ${instanceId || "(none)"}`);

    // ============================================================
    // ACTION: list-instances — list all instances for this company
    // ============================================================
    if (action === "list-instances") {
      const { data: instances } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });

      // Also get subscription limit
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("max_whatsapp_instances, plan_name, status")
        .eq("company_id", companyId)
        .single();

      return jsonResponse({
        success: true,
        instances: instances || [],
        maxInstances: sub?.max_whatsapp_instances ?? 1,
        planName: sub?.plan_name ?? null,
        subscriptionStatus: sub?.status ?? "trial",
      });

    // ============================================================
    // ACTION: connect — create/connect a specific instance
    // ============================================================
    } else if (action === "connect") {
      if (!settings.admin_token) {
        return jsonResponse({
          error: "Admin Token não configurado. Configure-o nas credenciais antes de conectar.",
        }, 400);
      }

      // Check subscription limit
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("max_whatsapp_instances")
        .eq("company_id", companyId)
        .single();

      const maxInstances = sub?.max_whatsapp_instances ?? 1;

      // If instanceId provided, reconnect existing instance
      if (instanceId) {
        const { data: existingInst } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("id", instanceId)
          .eq("company_id", companyId)
          .single();

        if (!existingInst) {
          return jsonResponse({ error: "Instância não encontrada." }, 404);
        }

        let instanceToken = existingInst.token;

        if (!instanceToken) {
          // Token was cleared (e.g., after a 401). Try to fetch the existing instance from uazapi
          // using admin_token to recover the current token, instead of blindly re-creating.
          console.log(`[whatsapp-connect] 🔄 Token missing for ${existingInst.instance_name}, trying to recover via admin...`);
          try {
            const listData = await callUazapi(
              baseUrl,
              "/instance/list",
              "GET",
              { name: "admintoken", value: settings.admin_token }
            );
            // listData may be an array or object with instances array
            const instanceList: any[] = Array.isArray(listData) ? listData : (listData?.instances || listData?.data || []);
            const found = instanceList.find((i: any) =>
              i.name === existingInst.instance_name || i.instanceName === existingInst.instance_name
            );
            if (found?.token) {
              instanceToken = found.token;
              console.log(`[whatsapp-connect] ✅ Recovered token for ${existingInst.instance_name}`);
              await supabase
                .from("whatsapp_instances")
                .update({ token: instanceToken, status: "disconnected" })
                .eq("id", instanceId);
            }
          } catch (listErr: any) {
            console.log(`[whatsapp-connect] ⚠️ Failed to list instances: ${JSON.stringify(listErr?.data || listErr)}`);
          }
        }

        if (!instanceToken) {
          // Could not recover — delete from uazapi and re-create fresh
          console.log(`[whatsapp-connect] 📦 Re-creating instance for ${existingInst.instance_name}...`);
          try {
            await callUazapi(
              baseUrl,
              "/instance/delete",
              "DELETE",
              { name: "admintoken", value: settings.admin_token },
              { name: existingInst.instance_name }
            );
          } catch (_) { /* may not exist, ignore */ }

          const createData = await callUazapi(
            baseUrl,
            "/instance/init",
            "POST",
            { name: "admintoken", value: settings.admin_token },
            { name: existingInst.instance_name }
          );

          instanceToken = createData?.token;
          const newInstanceId = createData?.instanceId || createData?.instance_id || createData?.name || existingInst.instance_name;

          if (!instanceToken) {
            return jsonResponse({ error: "UAZAPI não retornou token ao criar a instância.", details: createData }, 500);
          }

          await supabase
            .from("whatsapp_instances")
            .update({ token: instanceToken, instance_id: newInstanceId, status: "disconnected" })
            .eq("id", instanceId);
        }

        // Connect the instance
        try {
          const reqBody = await req.json().catch(() => ({}));
          const connectBody: Record<string, string> = {};
          if (reqBody.phone) connectBody.phone = reqBody.phone.replace(/\D/g, "");

          const connectData = await callUazapi(
            baseUrl,
            "/instance/connect",
            "POST",
            { name: "token", value: instanceToken },
            connectBody
          );

          return jsonResponse({ success: true, data: connectData });
        } catch (e: any) {
          if (e?.status === 401) {
            // Token still invalid after recovery attempt — clear it so next call re-creates
            await supabase
              .from("whatsapp_instances")
              .update({ token: null, instance_id: null, status: "disconnected" })
              .eq("id", instanceId);

            return jsonResponse({
              error: "Token inválido. A instância será recriada na próxima tentativa.",
              needsRetry: true,
            }, 401);
          }
          return jsonResponse({ error: `UAZAPI error ${e?.status || 500}`, details: e?.data || {} }, e?.status || 500);
        }
      }

      // No instanceId — create a NEW instance (if limit allows)
      const { count } = await supabase
        .from("whatsapp_instances")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);

      const currentCount = count ?? 0;

      if (currentCount >= maxInstances) {
        return jsonResponse({
          error: `Limite do plano atingido. Seu plano permite ${maxInstances} número(s) de WhatsApp. Entre em contato para fazer upgrade.`,
          limitReached: true,
          maxInstances,
          currentCount,
        }, 403);
      }

      // Generate unique instance name
      const instanceIndex = currentCount + 1;
      const instanceName = `inst-${companyId.substring(0, 8)}-${instanceIndex}`;

      console.log(`[whatsapp-connect] 📦 Creating new instance: ${instanceName} (${instanceIndex}/${maxInstances})`);

      const reqBody = await req.json().catch(() => ({}));
      const label = reqBody.label || `WhatsApp ${instanceIndex}`;

      const createData = await callUazapi(
        baseUrl,
        "/instance/init",
        "POST",
        { name: "admintoken", value: settings.admin_token },
        { name: instanceName }
      );

      const newToken = createData?.token;
      const newInstanceId = createData?.instanceId || createData?.instance_id || createData?.name || instanceName;

      if (!newToken) {
        return jsonResponse({
          error: "UAZAPI não retornou token ao criar a instância. Verifique o admin token.",
          details: createData,
        }, 500);
      }

      // Save new instance record
      const { data: newInst, error: insertErr } = await supabase
        .from("whatsapp_instances")
        .insert({
          company_id: companyId,
          instance_name: instanceName,
          instance_id: newInstanceId,
          token: newToken,
          label,
          status: "disconnected",
          is_primary: currentCount === 0,
        })
        .select("*")
        .single();

      if (insertErr || !newInst) {
        return jsonResponse({ error: "Erro ao salvar instância no banco.", details: insertErr }, 500);
      }

      // Also update legacy whatsapp_settings if this is the first instance
      if (currentCount === 0) {
        await supabase
          .from("whatsapp_settings")
          .update({ token: newToken, instance_id: newInstanceId })
          .eq("company_id", companyId);
      }

      await supabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: userId,
        user_email: userEmail,
        action: `WhatsApp: Criou instância ${label}`,
        category: "whatsapp",
        details: { instanceName, instanceIndex },
      });

      // Now connect it
      try {
        const connectBody: Record<string, string> = {};
        if (reqBody.phone) connectBody.phone = reqBody.phone.replace(/\D/g, "");

        const connectData = await callUazapi(
          baseUrl,
          "/instance/connect",
          "POST",
          { name: "token", value: newToken },
          connectBody
        );

        return jsonResponse({ success: true, data: connectData, instanceDbId: newInst.id, newInstance: true });
      } catch (e: any) {
        return jsonResponse({ error: `UAZAPI error ${e?.status || 500}`, details: e?.data || {} }, e?.status || 500);
      }

    // ============================================================
    // ACTION: status — Check instance status
    // ============================================================
    } else if (action === "status") {
      // Get specific instance token
      let instanceToken: string | null = null;
      let instanceDbId: string | null = instanceId;

      if (instanceId) {
        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("id", instanceId)
          .eq("company_id", companyId)
          .single();
        instanceToken = inst?.token ?? null;
      } else {
        // Fallback to legacy settings token (primary instance)
        instanceToken = settings.token ?? null;
        // Also try first instance
        if (!instanceToken) {
          const { data: firstInst } = await supabase
            .from("whatsapp_instances")
            .select("*")
            .eq("company_id", companyId)
            .eq("is_primary", true)
            .single();
          instanceToken = firstInst?.token ?? null;
          instanceDbId = firstInst?.id ?? null;
        }
      }

      if (!instanceToken) {
        return jsonResponse({ error: "Nenhuma instância configurada.", needsCreate: true }, 400);
      }

      try {
        const data = await callUazapi(
          baseUrl,
          "/instance/status",
          "GET",
          { name: "token", value: instanceToken }
        );

        const instanceStatus = data?.instance?.status || data?.status;
        const isConnected = instanceStatus === "connected" || data?.instance?.connected === true || data?.connected === true;

        if (isConnected) {
          const phoneNumber = data?.instance?.phone || data?.instance?.me?.id || null;

          // Update instance status in DB
          if (instanceDbId) {
            await supabase
              .from("whatsapp_instances")
              .update({ status: "connected", phone_number: phoneNumber })
              .eq("id", instanceDbId);
          }

          try {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const webhookUrl = `${supabaseUrl}/functions/v1/wa-webhook/${companyId}`;

            console.log(`[whatsapp-connect] 🔗 Auto-configuring webhook: ${webhookUrl}`);

            await callUazapi(
              baseUrl,
              "/webhook",
              "POST",
              { name: "token", value: instanceToken },
              { url: webhookUrl, enabled: true, events: ["Message"] }
            );

            await supabase
              .from("whatsapp_settings")
              .update({ active: true })
              .eq("company_id", companyId);

            try {
              await callUazapi(
                baseUrl,
                "/send/presence",
                "POST",
                { name: "token", value: instanceToken },
                { phone: "", presence: "available" }
              );
            } catch (_) { /* non-fatal */ }

          } catch (webhookErr: any) {
            console.error(`[whatsapp-connect] ⚠️ Webhook setup failed:`, JSON.stringify(webhookErr?.data || webhookErr));
          }
        } else {
          // Update status
          if (instanceDbId) {
            const qrcode = data?.instance?.qrcode || null;
            await supabase
              .from("whatsapp_instances")
              .update({ status: "connecting" })
              .eq("id", instanceDbId);
          }
        }

        return jsonResponse({ success: true, data });
      } catch (e: any) {
        if (e?.status === 401) {
          if (instanceDbId) {
            await supabase
              .from("whatsapp_instances")
              .update({ token: null, instance_id: null, status: "disconnected" })
              .eq("id", instanceDbId);
          }
          return jsonResponse({ error: "Token inválido. Conecte novamente.", needsCreate: true }, 400);
        }
        return jsonResponse({ error: `UAZAPI error ${e?.status || 500}`, details: e?.data || {} }, e?.status || 500);
      }

    // ============================================================
    // ACTION: disconnect — Disconnect specific instance
    // ============================================================
    } else if (action === "disconnect") {
      let instanceToken: string | null = null;
      let instanceDbId: string | null = instanceId;

      if (instanceId) {
        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("id", instanceId)
          .eq("company_id", companyId)
          .single();
        instanceToken = inst?.token ?? null;
      } else {
        instanceToken = settings.token ?? null;
      }

      if (!instanceToken) {
        return jsonResponse({ error: "Token da instância não configurado." }, 400);
      }

      try {
        const data = await callUazapi(
          baseUrl,
          "/instance/disconnect",
          "POST",
          { name: "token", value: instanceToken }
        );

        if (instanceDbId) {
          await supabase
            .from("whatsapp_instances")
            .update({ status: "disconnected", phone_number: null })
            .eq("id", instanceDbId);
        }

        return jsonResponse({ success: true, data });
      } catch (e: any) {
        return jsonResponse({ error: `UAZAPI error ${e?.status || 500}`, details: e?.data || {} }, e?.status || 500);
      }

    // ============================================================
    // ACTION: delete-instance — Delete an instance completely
    // ============================================================
    } else if (action === "delete-instance") {
      if (!instanceId) {
        return jsonResponse({ error: "instanceId é obrigatório." }, 400);
      }

      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("id", instanceId)
        .eq("company_id", companyId)
        .single();

      if (!inst) {
        return jsonResponse({ error: "Instância não encontrada." }, 404);
      }

      // Try to disconnect first, then delete from uazapi if possible
      if (inst.token) {
        try {
          await callUazapi(baseUrl, "/instance/disconnect", "POST", { name: "token", value: inst.token });
        } catch (_) { /* non-fatal */ }

        // Try to delete instance from uazapi via admin token
        if (settings.admin_token && inst.instance_id) {
          try {
            await callUazapi(
              baseUrl,
              `/instance/${inst.instance_name}`,
              "DELETE",
              { name: "admintoken", value: settings.admin_token }
            );
          } catch (_) { /* non-fatal */ }
        }
      }

      // Delete from DB
      await supabase.from("whatsapp_instances").delete().eq("id", instanceId);

      await supabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: userId,
        user_email: userEmail,
        action: `WhatsApp: Removeu instância ${inst.label || inst.instance_name}`,
        category: "whatsapp",
      });

      return jsonResponse({ success: true });

    // ============================================================
    // ACTION: update-label — Update instance label
    // ============================================================
    } else if (action === "update-label") {
      if (!instanceId) return jsonResponse({ error: "instanceId é obrigatório." }, 400);

      const reqBody = await req.json().catch(() => ({}));
      const newLabel = reqBody.label;
      if (!newLabel) return jsonResponse({ error: "label é obrigatório." }, 400);

      await supabase
        .from("whatsapp_instances")
        .update({ label: newLabel })
        .eq("id", instanceId)
        .eq("company_id", companyId);

      return jsonResponse({ success: true });

    // ============================================================
    // ACTION: set-webhook (legacy / manual trigger)
    // ============================================================
    } else if (action === "set-webhook") {
      let instanceToken: string | null = null;

      if (instanceId) {
        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("token")
          .eq("id", instanceId)
          .eq("company_id", companyId)
          .single();
        instanceToken = inst?.token ?? null;
      } else {
        instanceToken = settings.token ?? null;
      }

      if (!instanceToken) {
        return jsonResponse({ error: "Token não configurado." }, 400);
      }

      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const webhookUrl = `${supabaseUrl}/functions/v1/wa-webhook/${companyId}`;

        const data = await callUazapi(
          baseUrl,
          "/webhook",
          "POST",
          { name: "token", value: instanceToken },
          { url: webhookUrl, enabled: true, events: ["Message"] }
        );

        // Try global webhook via admin token
        if (settings.admin_token) {
          for (const endpoint of ["/admin/setGlobalWebhook", "/admin/globalWebhook", "/admin/webhook"]) {
            try {
              await callUazapi(baseUrl, endpoint, "POST", { name: "admintoken", value: settings.admin_token }, { url: webhookUrl, enabled: true, events: ["Message"] });
              break;
            } catch (_) { /* try next */ }
          }
        }

        return jsonResponse({ success: true, data });
      } catch (e: any) {
        return jsonResponse({ error: `UAZAPI error`, details: e?.data || {} }, e?.status || 500);
      }

    } else {
      return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

  } catch (err: any) {
    console.error("[whatsapp-connect] ❌ Unhandled error:", err);
    return jsonResponse({ error: err.message || "Internal error" }, 500);
  }
});
