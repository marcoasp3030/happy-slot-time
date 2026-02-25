import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function replacePlaceholders(
  template: string,
  data: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || "");
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

async function sendUazapiMessage(
  settings: { base_url: string; instance_id: string; token: string },
  phone: string,
  message: string
): Promise<any> {
  const url = `${settings.base_url.replace(/\/$/, "")}/send/text`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: settings.token,
    },
    body: JSON.stringify({ number: phone, text: message }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UAZAPI error ${res.status}: ${text}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all active notification rules across all companies
    const { data: rules, error: rulesErr } = await supabase
      .from("notification_rules")
      .select("*")
      .eq("active", true);

    if (rulesErr) {
      throw new Error(`Failed to fetch rules: ${rulesErr.message}`);
    }

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ message: "No active rules", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;
    let totalErrors = 0;
    const now = new Date();

    // Group rules by company
    const rulesByCompany = new Map<string, typeof rules>();
    for (const rule of rules) {
      const list = rulesByCompany.get(rule.company_id) || [];
      list.push(rule);
      rulesByCompany.set(rule.company_id, list);
    }

    for (const [companyId, companyRules] of rulesByCompany) {
      // Check WhatsApp settings
      const { data: wsSettings } = await supabase
        .from("whatsapp_settings")
        .select("*")
        .eq("company_id", companyId)
        .eq("active", true)
        .single();

      if (!wsSettings || !wsSettings.base_url || !wsSettings.instance_id || !wsSettings.token) {
        continue; // Skip companies without valid WhatsApp config
      }

      // Get reminder template for this company
      const { data: templateRow } = await supabase
        .from("message_templates")
        .select("template")
        .eq("company_id", companyId)
        .eq("type", "reminder")
        .eq("active", true)
        .single();

      if (!templateRow) continue;

      for (const rule of companyRules) {
        // Calculate the target window: appointments happening in ~minutes_before from now
        // We check a 5-minute window to avoid duplicate sends (cron runs every 5 min)
        const targetTime = new Date(now.getTime() + rule.minutes_before * 60 * 1000);
        const windowStart = new Date(targetTime.getTime() - 3 * 60 * 1000); // 3 min before
        const windowEnd = new Date(targetTime.getTime() + 3 * 60 * 1000);   // 3 min after

        const targetDate = targetTime.toISOString().split("T")[0];

        // Format times as HH:MM:SS for comparison
        const startTimeStr = windowStart.toTimeString().substring(0, 8);
        const endTimeStr = windowEnd.toTimeString().substring(0, 8);

        // If window crosses midnight, handle date boundaries (rare but safe)
        const startDate = windowStart.toISOString().split("T")[0];
        const endDate = windowEnd.toISOString().split("T")[0];

        // Fetch appointments in this window that haven't been reminded yet
        let query = supabase
          .from("appointments")
          .select("*, services(name), companies:company_id(name, address)")
          .eq("company_id", companyId)
          .in("status", ["pending", "confirmed"])
          .eq("appointment_date", targetDate)
          .gte("start_time", startTimeStr)
          .lte("start_time", endTimeStr);

        const { data: appointments, error: apptErr } = await query;

        if (apptErr || !appointments || appointments.length === 0) continue;

        for (const appt of appointments) {
          // Check if we already sent a reminder of this type for this appointment
          const { data: existingLog } = await supabase
            .from("whatsapp_logs")
            .select("id")
            .eq("appointment_id", appt.id)
            .eq("type", rule.type)
            .eq("status", "sent")
            .limit(1);

          if (existingLog && existingLog.length > 0) continue; // Already sent

          const placeholders: Record<string, string> = {
            cliente_nome: appt.client_name,
            data: formatDate(appt.appointment_date),
            hora: appt.start_time?.substring(0, 5) || "",
            servico: (appt as any).services?.name || "",
            empresa_nome: (appt as any).companies?.name || "",
            endereco: (appt as any).companies?.address || "",
          };

          const message = replacePlaceholders(templateRow.template, placeholders);
          const targetPhone = appt.client_phone.replace(/\D/g, "");

          let status = "sent";
          let error: string | null = null;
          let responsePayload: any = null;

          try {
            responsePayload = await sendUazapiMessage(wsSettings, targetPhone, message);
            totalSent++;
          } catch (e) {
            status = "error";
            error = e instanceof Error ? e.message : String(e);
            totalErrors++;
          }

          // Log the attempt
          await supabase.from("whatsapp_logs").insert({
            company_id: companyId,
            appointment_id: appt.id,
            phone: targetPhone,
            type: rule.type,
            status,
            error,
            payload: responsePayload
              ? { response: responsePayload, message }
              : { message, error },
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
        errors: totalErrors,
        timestamp: now.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Scheduler error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
