import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendRequest {
  appointment_id?: string;
  company_id: string;
  type: "confirmation" | "reminder" | "cancellation" | "reschedule" | "confirmation_request" | "test";
  phone?: string; // only for test
}

function replacePlaceholders(
  template: string,
  data: Record<string, string>
): string {
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

    const body: SendRequest = await req.json();
    const { company_id, type, appointment_id, phone } = body;

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch WhatsApp settings
    const { data: settings, error: settingsErr } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("company_id", company_id)
      .single();

    if (settingsErr || !settings) {
      return new Response(
        JSON.stringify({ error: "WhatsApp settings not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings.active) {
      return new Response(
        JSON.stringify({ error: "WhatsApp integration is disabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings.base_url || !settings.instance_id || !settings.token) {
      return new Response(
        JSON.stringify({ error: "Incomplete UAZAPI credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle test message
    if (type === "test") {
      if (!phone) {
        return new Response(
          JSON.stringify({ error: "phone is required for test" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const testMessage = "✅ Teste de conexão UAZAPI realizado com sucesso!";
      const result = await sendUazapiMessage(settings, phone, testMessage);

      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For non-test, appointment_id is required
    if (!appointment_id) {
      return new Response(
        JSON.stringify({ error: "appointment_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch appointment with service and company
    const { data: appointment, error: apptErr } = await supabase
      .from("appointments")
      .select("*, services(name), companies:company_id(name, address)")
      .eq("id", appointment_id)
      .single();

    if (apptErr || !appointment) {
      return new Response(
        JSON.stringify({ error: "Appointment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch template
    const { data: templateRow } = await supabase
      .from("message_templates")
      .select("template")
      .eq("company_id", company_id)
      .eq("type", type)
      .eq("active", true)
      .single();

    if (!templateRow) {
      return new Response(
        JSON.stringify({ error: `No active template for type: ${type}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build placeholders
    const placeholders: Record<string, string> = {
      cliente_nome: appointment.client_name,
      data: formatDate(appointment.appointment_date),
      hora: appointment.start_time?.substring(0, 5) || "",
      servico: (appointment as any).services?.name || "",
      empresa_nome: (appointment as any).companies?.name || "",
      endereco: (appointment as any).companies?.address || "",
    };

    const message = replacePlaceholders(templateRow.template, placeholders);
    const targetPhone = appointment.client_phone.replace(/\D/g, "");

    let status = "sent";
    let error: string | null = null;
    let responsePayload: any = null;

    try {
      responsePayload = await sendUazapiMessage(settings, targetPhone, message);
    } catch (e) {
      status = "error";
      error = e instanceof Error ? e.message : String(e);
    }

    // Log
    await supabase.from("whatsapp_logs").insert({
      company_id,
      appointment_id,
      phone: targetPhone,
      type,
      status,
      error,
      payload: responsePayload ? { response: responsePayload, message } : { message, error },
    });

    return new Response(
      JSON.stringify({ success: status === "sent", status, error }),
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

async function sendUazapiMessage(
  settings: { base_url: string; instance_id: string; token: string },
  phone: string,
  message: string
): Promise<any> {
  const url = `${settings.base_url.replace(/\/$/, "")}/send/text`;

  console.log(`[send-whatsapp] POST ${url}`);
  console.log(`[send-whatsapp] phone: ${phone}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: settings.token,
    },
    body: JSON.stringify({
      number: phone,
      text: message,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UAZAPI error ${res.status}: ${text}`);
  }

  return res.json();
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
