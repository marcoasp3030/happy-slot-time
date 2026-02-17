import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function replacePlaceholders(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || "");
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

    const { appointment_id, new_status } = await req.json();

    if (!appointment_id || !new_status) {
      return new Response(
        JSON.stringify({ error: "appointment_id and new_status are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only send for these statuses
    const allowedStatuses = ["confirmed", "canceled", "rescheduled"];
    if (!allowedStatuses.includes(new_status)) {
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: "Status does not trigger notification" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch appointment with service and company info
    const { data: apt, error: aptErr } = await supabase
      .from("appointments")
      .select("*, services(name), companies:company_id(name)")
      .eq("id", appointment_id)
      .single();

    if (aptErr || !apt) {
      return new Response(
        JSON.stringify({ error: "Appointment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch WhatsApp settings
    const { data: whatsappSettings } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("company_id", apt.company_id)
      .single();

    if (!whatsappSettings?.active || !whatsappSettings.base_url || !whatsappSettings.token) {
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: "WhatsApp not configured or inactive" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map status to template type
    const templateTypeMap: Record<string, string> = {
      confirmed: "confirmation",
      canceled: "cancellation",
      rescheduled: "reschedule",
    };

    const templateType = templateTypeMap[new_status];

    // Fetch message template
    const { data: tpl } = await supabase
      .from("message_templates")
      .select("template, buttons, send_notification")
      .eq("company_id", apt.company_id)
      .eq("type", templateType)
      .eq("active", true)
      .single();

    if (!tpl?.template) {
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: "No active template found for " + templateType }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if merchant wants to send this notification
    if (tpl.send_notification === false) {
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: "Notification disabled by merchant for " + templateType }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build placeholders
    const placeholders: Record<string, string> = {
      cliente_nome: apt.client_name,
      data: formatDate(apt.appointment_date),
      hora: apt.start_time?.substring(0, 5) || "",
      servico: (apt as any).services?.name || "",
      empresa_nome: (apt as any).companies?.name || "",
    };

    let message = replacePlaceholders(tpl.template, placeholders);

    // If confirming and has meet_link, append it
    if (new_status === "confirmed" && apt.meet_link) {
      message += `\n\n📹 Link da reunião: ${apt.meet_link}`;
    }

    // Send via UAZAPI
    const targetPhone = apt.client_phone.replace(/\D/g, "");
    const baseUrl = whatsappSettings.base_url.replace(/\/$/, "");
    const buttons: Array<{ id: string; text: string }> = Array.isArray(tpl.buttons) ? tpl.buttons.filter((b: any) => b?.text) : [];

    let res: Response;

    if (buttons.length > 0) {
      // Send with interactive buttons via /send/menu
      const menuBody = {
        number: targetPhone,
        menu: {
          header: "",
          body: message,
          footer: "",
          buttons: buttons.map((b: any) => ({
            type: "REPLY",
            id: b.id || `btn_${b.text.replace(/\s/g, '_')}`,
            title: b.text.substring(0, 20),
          })),
        },
      };
      res = await fetch(`${baseUrl}/send/menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: whatsappSettings.token },
        body: JSON.stringify(menuBody),
      });
    } else {
      // Send plain text
      res = await fetch(`${baseUrl}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: whatsappSettings.token },
        body: JSON.stringify({ number: targetPhone, text: message }),
      });
    }

    const logType = new_status === "confirmed" ? "confirmation" : new_status === "canceled" ? "cancellation" : "reschedule";

    if (!res.ok) {
      const errText = await res.text();
      // Log error
      await supabase.from("whatsapp_logs").insert({
        company_id: apt.company_id,
        appointment_id: apt.id,
        phone: targetPhone,
        type: logType,
        status: "error",
        error: `UAZAPI ${res.status}: ${errText}`,
      });
      return new Response(
        JSON.stringify({ success: false, error: `UAZAPI error: ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log success
    await supabase.from("whatsapp_logs").insert({
      company_id: apt.company_id,
      appointment_id: apt.id,
      phone: targetPhone,
      type: logType,
      status: "sent",
      payload: { message },
    });

    return new Response(
      JSON.stringify({ success: true, sent: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("notify-appointment-status error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
