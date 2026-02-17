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
  reschedule?: boolean; // auto-reschedule to next available date
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

// Find the next available slot for a given service duration, starting from the day after canceledDate
async function findNextAvailableSlot(
  supabase: any,
  companyId: string,
  canceledDate: string,
  serviceDuration: number,
  staffId: string | null
): Promise<{ date: string; startTime: string; endTime: string } | null> {
  // Fetch business hours
  const { data: businessHours } = await supabase
    .from("business_hours")
    .select("*")
    .eq("company_id", companyId)
    .order("day_of_week");

  if (!businessHours || businessHours.length === 0) return null;

  // Fetch company settings
  const { data: settings } = await supabase
    .from("company_settings")
    .select("slot_interval, min_advance_hours, max_capacity_per_slot")
    .eq("company_id", companyId)
    .single();

  const interval = settings?.slot_interval || 30;
  const maxCapacity = settings?.max_capacity_per_slot || 1;

  // Fetch future time blocks
  const { data: timeBlocks } = await supabase
    .from("time_blocks")
    .select("*")
    .eq("company_id", companyId)
    .gte("block_date", canceledDate);

  // Search up to 30 days ahead
  for (let dayOffset = 1; dayOffset <= 30; dayOffset++) {
    const d = new Date(canceledDate + "T12:00:00");
    d.setDate(d.getDate() + dayOffset);
    const dateStr = d.toISOString().split("T")[0];
    const dayOfWeek = d.getDay();

    const bh = businessHours.find((h: any) => h.day_of_week === dayOfWeek);
    if (!bh || !bh.is_open) continue;

    // Check full-day blocks
    const fullDayBlock = (timeBlocks || []).find(
      (b: any) => b.block_date === dateStr && !b.start_time && !b.end_time &&
        (!b.staff_id || b.staff_id === staffId)
    );
    if (fullDayBlock && !fullDayBlock.staff_id) continue;

    // Get time-specific blocks for this date
    const dateBlocks = (timeBlocks || []).filter(
      (b: any) => b.block_date === dateStr && b.start_time && b.end_time &&
        (!b.staff_id || b.staff_id === staffId)
    );

    // Fetch existing appointments for this date
    const { data: existingApts } = await supabase
      .from("appointments")
      .select("start_time, end_time")
      .eq("company_id", companyId)
      .eq("appointment_date", dateStr)
      .neq("status", "canceled");

    const [openH, openM] = bh.open_time.split(":").map(Number);
    const [closeH, closeM] = bh.close_time.split(":").map(Number);
    let current = openH * 60 + openM;
    const end = closeH * 60 + closeM;

    while (current + serviceDuration <= end) {
      const hh = String(Math.floor(current / 60)).padStart(2, "0");
      const mm = String(current % 60).padStart(2, "0");
      const timeStr = `${hh}:${mm}`;
      const endMin = current + serviceDuration;
      const endHH = String(Math.floor(endMin / 60)).padStart(2, "0");
      const endMM = String(endMin % 60).padStart(2, "0");
      const endStr = `${endHH}:${endMM}`;

      // Check time blocks
      const isBlocked = dateBlocks.some((b: any) => {
        const bs = b.start_time.slice(0, 5);
        const be = b.end_time.slice(0, 5);
        return timeStr < be && endStr > bs;
      });

      if (!isBlocked) {
        // Check capacity
        const conflicts = (existingApts || []).filter((a: any) => {
          const aStart = a.start_time.slice(0, 5);
          const aEnd = a.end_time.slice(0, 5);
          return timeStr < aEnd && endStr > aStart;
        });

        if (conflicts.length < maxCapacity) {
          return { date: dateStr, startTime: timeStr, endTime: endStr };
        }
      }

      current += interval;
    }
  }

  return null;
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
    const { company_id, date, reason, send_whatsapp, reschedule } = body;

    if (!company_id || !date) {
      return new Response(
        JSON.stringify({ error: "company_id and date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch appointments for this date that are not already canceled
    const { data: appointments, error: apptErr } = await supabase
      .from("appointments")
      .select("*, services(name, duration), companies:company_id(name)")
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
        JSON.stringify({ success: true, canceled: 0, rescheduled: 0, whatsapp_sent: 0, message: "No appointments to cancel" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let whatsappSent = 0;
    let googleDeleted = 0;
    let rescheduledCount = 0;
    const rescheduledDetails: Array<{ client: string; oldDate: string; oldTime: string; newDate: string; newTime: string }> = [];

    // Fetch WhatsApp settings if needed
    let whatsappSettings: any = null;
    let cancellationTemplate: string | null = null;
    let rescheduleTemplate: string | null = null;

    if (send_whatsapp) {
      const { data: settings } = await supabase
        .from("whatsapp_settings")
        .select("*")
        .eq("company_id", company_id)
        .single();

      if (settings?.active && settings.base_url && settings.instance_id && settings.token) {
        whatsappSettings = settings;

        const [cancelTpl, rescheduleTpl] = await Promise.all([
          supabase.from("message_templates").select("template")
            .eq("company_id", company_id).eq("type", "cancellation").eq("active", true).single(),
          supabase.from("message_templates").select("template")
            .eq("company_id", company_id).eq("type", "reschedule").eq("active", true).single(),
        ]);

        cancellationTemplate = cancelTpl.data?.template || null;
        rescheduleTemplate = rescheduleTpl.data?.template || null;
      }
    }

    // Process each appointment
    for (const apt of appointments) {
      const serviceDuration = (apt as any).services?.duration || 30;
      let wasRescheduled = false;
      let newSlot: { date: string; startTime: string; endTime: string } | null = null;

      // Try to reschedule if requested
      if (reschedule) {
        newSlot = await findNextAvailableSlot(
          supabase, company_id, date, serviceDuration, apt.staff_id
        );

        if (newSlot) {
          // Create new appointment
          const { error: insertErr } = await supabase.from("appointments").insert({
            company_id: company_id,
            service_id: apt.service_id,
            staff_id: apt.staff_id,
            client_name: apt.client_name,
            client_phone: apt.client_phone,
            appointment_date: newSlot.date,
            start_time: newSlot.startTime,
            end_time: newSlot.endTime,
            notes: `Remarcado de ${formatDate(date)} ${apt.start_time?.slice(0, 5)}${reason ? ` — Motivo: ${reason}` : ""}`,
            status: "confirmed",
          });

          if (!insertErr) {
            wasRescheduled = true;
            rescheduledCount++;
            rescheduledDetails.push({
              client: apt.client_name,
              oldDate: date,
              oldTime: apt.start_time?.slice(0, 5) || "",
              newDate: newSlot.date,
              newTime: newSlot.startTime,
            });
          }
        }
      }

      // Update original appointment status
      const newStatus = wasRescheduled ? "rescheduled" : "canceled";
      const noteText = wasRescheduled
        ? `Remarcado para ${formatDate(newSlot!.date)} às ${newSlot!.startTime}${reason ? ` — ${reason}` : ""}`
        : reason ? `Cancelamento em massa: ${reason}` : "Cancelamento em massa";

      await supabase
        .from("appointments")
        .update({ status: newStatus, notes: noteText })
        .eq("id", apt.id);

      // Delete Google Calendar event if exists
      if (apt.google_calendar_event_id) {
        await deleteGoogleCalendarEvent(supabase, company_id, apt.google_calendar_event_id, apt.staff_id);
        googleDeleted++;
      }

      // Send WhatsApp notification
      if (whatsappSettings) {
        try {
          const targetPhone = apt.client_phone.replace(/\D/g, "");
          let message: string | null = null;

          if (wasRescheduled && rescheduleTemplate && newSlot) {
            const placeholders: Record<string, string> = {
              cliente_nome: apt.client_name,
              data: formatDate(newSlot.date),
              hora: newSlot.startTime,
              data_antiga: formatDate(date),
              hora_antiga: apt.start_time?.substring(0, 5) || "",
              servico: (apt as any).services?.name || "",
              empresa_nome: (apt as any).companies?.name || "",
            };
            message = replacePlaceholders(rescheduleTemplate, placeholders);
          } else if (!wasRescheduled && cancellationTemplate) {
            const placeholders: Record<string, string> = {
              cliente_nome: apt.client_name,
              data: formatDate(apt.appointment_date),
              hora: apt.start_time?.substring(0, 5) || "",
              servico: (apt as any).services?.name || "",
              empresa_nome: (apt as any).companies?.name || "",
            };
            message = replacePlaceholders(cancellationTemplate, placeholders);
          }

          if (message) {
            await sendUazapiMessage(whatsappSettings, targetPhone, message);
            await supabase.from("whatsapp_logs").insert({
              company_id,
              appointment_id: apt.id,
              phone: targetPhone,
              type: wasRescheduled ? "reschedule" : "cancellation",
              status: "sent",
              payload: { message, reason: reason || (wasRescheduled ? "Remarcação em massa" : "Cancelamento em massa") },
            });
            whatsappSent++;
          }
        } catch (e) {
          console.error("WhatsApp send error for", apt.id, e);
          await supabase.from("whatsapp_logs").insert({
            company_id,
            appointment_id: apt.id,
            phone: apt.client_phone.replace(/\D/g, ""),
            type: wasRescheduled ? "reschedule" : "cancellation",
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        canceled: appointments.length - rescheduledCount,
        rescheduled: rescheduledCount,
        rescheduled_details: rescheduledDetails,
        whatsapp_sent: whatsappSent,
        google_deleted: googleDeleted,
        total_affected: appointments.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Mass cancel error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
