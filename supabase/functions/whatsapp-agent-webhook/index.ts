import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const startTime = Date.now();
    const rawBody = await req.text();
    console.log(`[webhook] 📨 Incoming: ${rawBody.substring(0, 500)}`);
    const body = JSON.parse(rawBody);

    const phone = body?.phone || body?.from || body?.data?.from || body?.data?.key?.remoteJid?.replace("@s.whatsapp.net", "") || null;
    const messageType = (body?.data?.message?.audioMessage || body?.type === "audio") ? "audio" : "text";
    const audioUrl = body?.mediaUrl || body?.media_url || body?.data?.mediaUrl || body?.data?.media_url || null;
    let messageText = body?.message || body?.text || body?.data?.message?.conversation || body?.data?.message?.extendedTextMessage?.text || null;

    const url = new URL(req.url);
    const companyId = url.searchParams.get("company_id");
    if (!companyId) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: agentSettings } = await supabase
      .from("whatsapp_agent_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    if (!agentSettings?.enabled) {
      console.log("[webhook] Agent disabled for company:", companyId);
      return new Response(JSON.stringify({ ok: true, skipped: "agent_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle audio transcription
    const isAudio = messageType === "audio" && audioUrl;
    if (isAudio) {
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (OPENAI_API_KEY) {
        try {
          const audioResponse = await fetch(audioUrl);
          if (audioResponse.ok) {
            const audioBlob = await audioResponse.blob();
            const formData = new FormData();
            formData.append("file", audioBlob, "audio.ogg");
            formData.append("model", "whisper-1");
            formData.append("language", "pt");
            const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
              method: "POST",
              headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
              body: formData,
            });
            if (whisperRes.ok) {
              const result = await whisperRes.json();
              if (result.text) messageText = result.text;
            }
          }
        } catch (e) {
          console.error("Audio transcription error:", e);
        }
      }
    }

    if (!phone || !messageText) {
      console.log("[webhook] No phone or message, skipping");
      return new Response(JSON.stringify({ ok: true, skipped: "no_message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[webhook] Processing message from ${phone}: ${messageText.substring(0, 100)}`);

    // Get or create conversation
    let { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("company_id", companyId)
      .eq("phone", phone)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from("whatsapp_conversations")
        .insert({ company_id: companyId, phone, status: "active" })
        .select()
        .single();
      conversation = newConv;
    }

    if (!conversation) throw new Error("Failed to create conversation");

    if (conversation.handoff_requested) {
      return new Response(JSON.stringify({ ok: true, skipped: "handoff_active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save incoming message
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conversation.id,
      company_id: companyId,
      direction: "incoming",
      message_type: isAudio ? "audio" : messageType,
      content: messageText,
      media_url: isAudio ? audioUrl : null,
    });

    await supabase.from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // Gather context
    const context = await gatherContext(supabase, companyId, phone, conversation.id);

    // Call AI
    const aiResponse = await callAI(context, messageText, agentSettings);

    // Process response
    const { responseText, actions } = await processAIResponse(
      supabase, companyId, phone, conversation, aiResponse, agentSettings
    );

    // Save outgoing message
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conversation.id,
      company_id: companyId,
      direction: "outgoing",
      message_type: "text",
      content: responseText,
    });

    // Send via WhatsApp
    await sendWhatsAppResponse(supabase, companyId, phone, responseText);

    // Log actions
    for (const action of actions) {
      await supabase.from("whatsapp_agent_logs").insert({
        company_id: companyId,
        conversation_id: conversation.id,
        action: action.type,
        details: action.details,
      });
    }

    const responseTimeMs = Date.now() - startTime;
    await supabase.from("whatsapp_agent_logs").insert({
      company_id: companyId,
      conversation_id: conversation.id,
      action: "response_sent",
      details: { response_time_ms: responseTimeMs },
    });

    console.log(`[webhook] ✅ Response sent in ${responseTimeMs}ms`);

    return new Response(JSON.stringify({ ok: true, response: responseText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[webhook] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ========== CONTEXT ==========

async function gatherContext(supabase: any, companyId: string, phone: string, conversationId: string) {
  const [messagesRes, appointmentsRes, companyRes, servicesRes, hoursRes, knowledgeRes, settingsRes] = await Promise.all([
    supabase.from("whatsapp_messages").select("direction, content, message_type, created_at")
      .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(20),
    supabase.from("appointments").select("id, client_name, appointment_date, start_time, end_time, status, services(name), staff(name)")
      .eq("company_id", companyId).or(`client_phone.eq.${phone.replace(/\D/g, "")},client_phone.eq.+${phone.replace(/\D/g, "")}`)
      .in("status", ["pending", "confirmed"]).order("appointment_date", { ascending: true }).limit(10),
    supabase.from("companies").select("name, address, phone").eq("id", companyId).single(),
    supabase.from("services").select("name, duration, price, description").eq("company_id", companyId).eq("active", true),
    supabase.from("business_hours").select("day_of_week, open_time, close_time, is_open").eq("company_id", companyId),
    supabase.from("whatsapp_knowledge_base").select("category, title, content").eq("company_id", companyId).eq("active", true),
    supabase.from("company_settings").select("slot_interval, max_capacity_per_slot, min_advance_hours").eq("company_id", companyId).single(),
  ]);

  return {
    messages: (messagesRes.data || []).reverse(),
    appointments: appointmentsRes.data || [],
    company: companyRes.data || {},
    services: servicesRes.data || [],
    hours: hoursRes.data || [],
    knowledge: knowledgeRes.data || [],
    companySettings: settingsRes.data || {},
  };
}

// ========== AI ==========

const DAYS_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function buildSystemPrompt(context: any, agentSettings: any): string {
  const { company, services, hours, knowledge, appointments, companySettings } = context;

  const hoursStr = (hours || [])
    .sort((a: any, b: any) => a.day_of_week - b.day_of_week)
    .map((h: any) => `${DAYS_PT[h.day_of_week]}: ${h.is_open ? `${h.open_time?.substring(0, 5)} - ${h.close_time?.substring(0, 5)}` : "Fechado"}`)
    .join("\n");

  const servicesStr = (services || [])
    .map((s: any) => `- ${s.name}: ${s.duration}min, R$${s.price || "consultar"}${s.description ? ` (${s.description})` : ""}`)
    .join("\n");

  const knowledgeStr = (knowledge || [])
    .map((k: any) => `[${k.category}] ${k.title}: ${k.content}`)
    .join("\n");

  const appointmentsStr = (appointments || [])
    .map((a: any, i: number) => `${i + 1}. ${a.services?.name || "Serviço"} em ${formatDate(a.appointment_date)} às ${a.start_time?.substring(0, 5)} - Status: ${a.status}${a.staff?.name ? ` com ${a.staff.name}` : ""}`)
    .join("\n");

  return `Você é o assistente virtual da "${company.name || 'empresa'}". Responda sempre em português brasileiro, de forma curta, educada e objetiva.

DADOS DA EMPRESA:
- Nome: ${company.name || "N/A"}
- Endereço: ${company.address || "N/A"}
- Telefone: ${company.phone || "N/A"}

HORÁRIOS DE FUNCIONAMENTO:
${hoursStr || "Não configurado"}

SERVIÇOS:
${servicesStr || "Nenhum serviço cadastrado"}

CONFIGURAÇÕES:
- Intervalo de slots: ${companySettings.slot_interval || 30} minutos
- Antecedência mínima: ${companySettings.min_advance_hours || 2} horas
- Política de cancelamento: mínimo ${agentSettings.cancellation_policy_hours || 24}h de antecedência

BASE DE CONHECIMENTO:
${knowledgeStr || "Nenhuma informação adicional"}

AGENDAMENTOS ATIVOS DO CLIENTE:
${appointmentsStr || "Nenhum agendamento ativo"}

REGRAS:
1. Se o cliente quiser CONFIRMAR um agendamento, use a tool "confirm_appointment".
2. Se o cliente quiser CANCELAR, verifique a política de cancelamento. Se dentro do prazo, peça confirmação e use "cancel_appointment".
3. Se o cliente quiser REAGENDAR, pergunte para qual dia e sugira horários usando "check_availability". Depois use "reschedule_appointment".
4. Se o cliente pedir um "atendente" ou "humano", use "request_handoff".
5. Se houver mais de um agendamento ativo, pergunte qual deseja alterar.
6. Nunca invente informações. Use apenas os dados fornecidos.
7. Mantenha as respostas curtas (máx 3 frases).
8. Use emojis moderadamente.`;
}

async function callAI(context: any, userMessage: string, agentSettings: any) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = buildSystemPrompt(context, agentSettings);
  const chatMessages: any[] = [{ role: "system", content: systemPrompt }];

  for (const msg of context.messages) {
    chatMessages.push({
      role: msg.direction === "incoming" ? "user" : "assistant",
      content: msg.content || "",
    });
  }
  chatMessages.push({ role: "user", content: userMessage });

  const tools = [
    { type: "function", function: { name: "confirm_appointment", description: "Confirma um agendamento.", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
    { type: "function", function: { name: "cancel_appointment", description: "Cancela um agendamento.", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
    { type: "function", function: { name: "check_availability", description: "Verifica horários disponíveis.", parameters: { type: "object", properties: { date: { type: "string" }, service_id: { type: "string" } }, required: ["date"] } } },
    { type: "function", function: { name: "reschedule_appointment", description: "Reagenda um agendamento.", parameters: { type: "object", properties: { appointment_id: { type: "string" }, new_date: { type: "string" }, new_time: { type: "string" } }, required: ["appointment_id", "new_date", "new_time"] } } },
    { type: "function", function: { name: "request_handoff", description: "Transfere para humano.", parameters: { type: "object", properties: {} } } },
  ];

  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: chatMessages, tools }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI Gateway error:", response.status, errText);
    throw new Error(`AI error ${response.status}`);
  }

  return response.json();
}

// ========== PROCESS RESPONSE ==========

async function processAIResponse(
  supabase: any, companyId: string, _phone: string, conversation: any, aiResult: any, agentSettings: any
) {
  const choice = aiResult.choices?.[0];
  const actions: { type: string; details: any }[] = [];
  let responseText = choice?.message?.content || "";

  if (choice?.message?.tool_calls) {
    for (const toolCall of choice.message.tool_calls) {
      const fn = toolCall.function.name;
      let args: any = {};
      try { args = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }

      if (fn === "confirm_appointment") {
        const { error } = await supabase.from("appointments").update({ status: "confirmed" }).eq("id", args.appointment_id).eq("company_id", companyId);
        actions.push({ type: "confirm", details: { appointment_id: args.appointment_id } });
        if (!error) responseText = responseText || "✅ Seu agendamento foi confirmado! Até lá! 😊";
        else responseText = responseText || "Desculpe, não consegui confirmar. Tente novamente.";
      } else if (fn === "cancel_appointment") {
        const { error } = await supabase.from("appointments").update({ status: "canceled" }).eq("id", args.appointment_id).eq("company_id", companyId);
        actions.push({ type: "cancel", details: { appointment_id: args.appointment_id } });
        if (!error) responseText = responseText || "❌ Agendamento cancelado. Se precisar, estou aqui!";
        else responseText = responseText || "Desculpe, não consegui cancelar. Tente novamente.";
      } else if (fn === "reschedule_appointment") {
        const { data: appt } = await supabase.from("appointments").select("services(duration)").eq("id", args.appointment_id).single();
        const duration = appt?.services?.duration || 30;
        const [h, m] = args.new_time.split(":").map(Number);
        const endMin = h * 60 + m + duration;
        const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
        const { error } = await supabase.from("appointments").update({ appointment_date: args.new_date, start_time: args.new_time, end_time: endTime, status: "pending" }).eq("id", args.appointment_id).eq("company_id", companyId);
        actions.push({ type: "reschedule", details: args });
        if (!error) responseText = responseText || `📅 Remarcado para ${formatDate(args.new_date)} às ${args.new_time}!`;
        else responseText = responseText || "Desculpe, não consegui reagendar.";
      } else if (fn === "check_availability") {
        const slots = await getAvailableSlots(supabase, companyId, args.date);
        actions.push({ type: "check_availability", details: { date: args.date, slots_found: slots.length } });
        if (slots.length === 0) responseText = responseText || `Sem horários em ${formatDate(args.date)}. Quer outro dia?`;
        else {
          const slotsStr = slots.slice(0, agentSettings.max_reschedule_suggestions || 5).join(", ");
          responseText = responseText || `📋 Horários em ${formatDate(args.date)}:\n${slotsStr}\n\nQual prefere?`;
        }
      } else if (fn === "request_handoff") {
        await supabase.from("whatsapp_conversations").update({ handoff_requested: true, status: "handoff" }).eq("id", conversation.id);
        actions.push({ type: "handoff", details: {} });
        responseText = responseText || "🙋 Transferindo para um atendente. Aguarde!";
      }
    }
  }

  if (!responseText) responseText = "Desculpe, não entendi. Pode reformular? Ou digite 'atendente' para falar com alguém.";
  return { responseText, actions };
}

// ========== AVAILABILITY ==========

async function getAvailableSlots(supabase: any, companyId: string, dateStr: string): Promise<string[]> {
  const date = new Date(dateStr + "T00:00:00");
  const dayOfWeek = date.getDay();

  const { data: bh } = await supabase.from("business_hours").select("*").eq("company_id", companyId).eq("day_of_week", dayOfWeek).single();
  if (!bh || !bh.is_open) return [];

  const { data: settings } = await supabase.from("company_settings").select("slot_interval, max_capacity_per_slot").eq("company_id", companyId).single();
  const interval = settings?.slot_interval || 30;
  const maxCap = settings?.max_capacity_per_slot || 1;

  const [existingRes, blocksRes] = await Promise.all([
    supabase.from("appointments").select("start_time, end_time").eq("company_id", companyId).eq("appointment_date", dateStr).in("status", ["pending", "confirmed"]),
    supabase.from("time_blocks").select("start_time, end_time").eq("company_id", companyId).eq("block_date", dateStr),
  ]);

  const existing = existingRes.data || [];
  const blocks = blocksRes.data || [];
  const slots: string[] = [];

  const toMin = (t: string) => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h * 60 + m; };

  const [openH, openM] = bh.open_time.split(":").map(Number);
  const [closeH, closeM] = bh.close_time.split(":").map(Number);
  let cur = openH * 60 + openM;
  const end = closeH * 60 + closeM;

  while (cur < end) {
    const slotTime = `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`;
    const blocked = blocks.some((b: any) => {
      if (!b.start_time && !b.end_time) return true;
      return cur >= toMin(b.start_time) && cur < toMin(b.end_time);
    });
    if (!blocked) {
      const conflicts = existing.filter((a: any) => cur >= toMin(a.start_time) && cur < toMin(a.end_time));
      if (conflicts.length < maxCap) slots.push(slotTime);
    }
    cur += interval;
  }

  return slots;
}

// ========== SEND ==========

async function sendWhatsAppResponse(supabase: any, companyId: string, phone: string, message: string) {
  const { data: settings } = await supabase.from("whatsapp_settings").select("*").eq("company_id", companyId).single();
  if (!settings?.active || !settings?.base_url || !settings?.token) {
    console.error("WhatsApp not configured for:", companyId);
    return;
  }

  const apiUrl = `${settings.base_url.replace(/\/$/, "")}/send/text`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: settings.token },
    body: JSON.stringify({ number: phone.replace(/\D/g, ""), text: message }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("UAZAPI send error:", res.status, text);
  }
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
