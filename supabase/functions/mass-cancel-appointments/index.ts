import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MassCancelRequest {
  company_id: string;
  date: string; // YYYY-MM-DD
  reason?: string;
  send_whatsapp?: boolean;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function replacePlaceholders(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || "");
}

async function sendUazapiMessage(
  settings: { base_url: string; instance_id: string; token: string },
  phone: string,
  message: string
): Promise<any> {
  const url = `${settings.base_url.replace(/\/$/, "")}/sendText/${settings.instance_id}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.token}`,
    },
    body: JSON.stringify({ phone, message }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UAZAPI error ${res.status}: ${text}`);
  }
  return res.json();
}

async function deleteGoogleCalendarEvent(
  supabase: any,
  companyId: string,
  eventId: string,
  staffId: string | null
) {
  try {
    // Find the right token (staff-specific or company-wide)
    let tokenQuery = supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("company_id", companyId);

    if (staffId) {
      tokenQuery = tokenQuery.eq("staff_id", staffId);
    } else {
      tokenQuery = tokenQuery.is("staff_id", null);
    }

    const { data: token } = await tokenQuery.single();
    if (!token) return;

    // Check if token needs refresh
    let accessToken = token.access_token;
    if (new Date(token.token_expires_at) <= new Date()) {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
      if (clientId && clientSecret) {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: token.refresh_token,
            grant_type: "refresh_token",
          }),
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          accessToken = refreshData.access_token;
          await supabase
            .from("google_calendar_tokens")
            .update({
              access_token: accessToken,
              token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
            })
            .eq("id", token.id);
        }
      }
    }

    const calendarId = token.calendar_id || "primary";
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  } catch (e) {
    console.error("Error deleting Google Calendar event:", e);
  }
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

    const body: MassCancelRequest = await req.json();
    const { company_id, date, reason, send_whatsapp } = body;

    if (!company_id || !date) {
      return new Response(
        JSON.stringify({ error: "company_id and date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch appointments for this date that are not already canceled
    const { data: appointments, error: apptErr } = await supabase
      .from("appointments")
      .select("*, services(name), companies:company_id(name)")
      .eq("company_id", company_id)
      .eq("appointment_date", date)
      .in("status", ["pending", "confirmed"]);

    if (apptErr) {
      return new Response(
        JSON.stringify({ error: "Error fetching appointments" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!appointments || appointments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, canceled: 0, whatsapp_sent: 0, message: "No appointments to cancel" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let whatsappSent = 0;
    let googleDeleted = 0;

    // Fetch WhatsApp settings if needed
    let whatsappSettings: any = null;
    let cancellationTemplate: string | null = null;

    if (send_whatsapp) {
      const { data: settings } = await supabase
        .from("whatsapp_settings")
        .select("*")
        .eq("company_id", company_id)
        .single();

      if (settings?.active && settings.base_url && settings.instance_id && settings.token) {
        whatsappSettings = settings;

        const { data: templateRow } = await supabase
          .from("message_templates")
          .select("template")
          .eq("company_id", company_id)
          .eq("type", "cancellation")
          .eq("active", true)
          .single();

        cancellationTemplate = templateRow?.template || null;
      }
    }

    // Process each appointment
    for (const apt of appointments) {
      // Update status to canceled
      await supabase
        .from("appointments")
        .update({ status: "canceled", notes: reason ? `Cancelamento em massa: ${reason}` : "Cancelamento em massa" })
        .eq("id", apt.id);

      // Delete Google Calendar event if exists
      if (apt.google_calendar_event_id) {
        await deleteGoogleCalendarEvent(supabase, company_id, apt.google_calendar_event_id, apt.staff_id);
        googleDeleted++;
      }

      // Send WhatsApp notification
      if (whatsappSettings && cancellationTemplate) {
        try {
          const placeholders: Record<string, string> = {
            cliente_nome: apt.client_name,
            data: formatDate(apt.appointment_date),
            hora: apt.start_time?.substring(0, 5) || "",
            servico: (apt as any).services?.name || "",
            empresa_nome: (apt as any).companies?.name || "",
          };

          const message = replacePlaceholders(cancellationTemplate, placeholders);
          const targetPhone = apt.client_phone.replace(/\D/g, "");

          await sendUazapiMessage(whatsappSettings, targetPhone, message);

          await supabase.from("whatsapp_logs").insert({
            company_id,
            appointment_id: apt.id,
            phone: targetPhone,
            type: "cancellation",
            status: "sent",
            payload: { message, reason: reason || "Cancelamento em massa" },
          });

          whatsappSent++;
        } catch (e) {
          console.error("WhatsApp send error for", apt.id, e);
          await supabase.from("whatsapp_logs").insert({
            company_id,
            appointment_id: apt.id,
            phone: apt.client_phone.replace(/\D/g, ""),
            type: "cancellation",
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        canceled: appointments.length,
        whatsapp_sent: whatsappSent,
        google_deleted: googleDeleted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
