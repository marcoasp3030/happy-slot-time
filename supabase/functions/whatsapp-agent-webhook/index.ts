import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
    console.log(`[webhook] 📨 Incoming request: ${rawBody.substring(0, 500)}`);
    const body = JSON.parse(rawBody);

    // UAZAPI sends various event formats - extract message data
    const phone = extractPhone(body);
    const messageType = extractType(body);
    const audioUrl = extractAudioUrl(body);
    let messageText = extractText(body);

    // Find company
    const url = new URL(req.url);
    const companyId = url.searchParams.get("company_id");
    if (!companyId) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if agent is enabled
    const { data: agentSettings } = await supabase
      .from("whatsapp_agent_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    if (!agentSettings?.enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: "agent_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle audio transcription via OpenAI Whisper
    const isAudio = messageType === "audio" && audioUrl;
    if (isAudio) {
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (OPENAI_API_KEY) {
        try {
          const transcription = await transcribeAudio(audioUrl, OPENAI_API_KEY);
          if (transcription) {
            messageText = transcription;
          }
        } catch (e) {
          console.error("Audio transcription error:", e);
        }
      } else {
        console.warn("OPENAI_API_KEY not set, cannot transcribe audio");
      }
    }

    if (!phone || !messageText) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    if (!conversation) {
      throw new Error("Failed to create conversation");
    }

    // Check handoff
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
      metadata: isAudio ? { transcribed: true, original_type: "audio" } : {},
    });

    // Update last_message_at
    await supabase
      .from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // Gather context for AI
    const context = await gatherContext(supabase, companyId, phone, conversation.id);

    // Call AI to generate response with tool calling
    const aiResponse = await callAI(supabase, companyId, context, messageText, agentSettings);

    // Process AI response (may include tool calls for actions)
    const { responseText, actions } = await processAIResponse(
      supabase, companyId, phone, conversation, aiResponse, agentSettings
    );

    // Save outgoing message
    const outgoingMessageType = (isAudio && agentSettings.respond_audio_with_audio) ? "audio" : "text";
    await supabase.from("whatsapp_messages").insert({
      conversation_id: conversation.id,
      company_id: companyId,
      direction: "outgoing",
      message_type: outgoingMessageType,
      content: responseText,
    });

    // Send response - audio or text
    if (isAudio && agentSettings.respond_audio_with_audio) {
      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      if (ELEVENLABS_API_KEY) {
        try {
          const voiceId = agentSettings.elevenlabs_voice_id || "EXAVITQu4vr4xnSDxMaL"; // Sarah default
          const audioBase64 = await generateTTS(responseText, voiceId, ELEVENLABS_API_KEY);
          await sendWhatsAppAudio(supabase, companyId, phone, audioBase64);
        } catch (e) {
          console.error("TTS/send audio error:", e);
          // Fallback to text
          await sendWhatsAppResponse(supabase, companyId, phone, responseText);
        }
      } else {
        await sendWhatsAppResponse(supabase, companyId, phone, responseText);
      }
    } else {
      await sendWhatsAppResponse(supabase, companyId, phone, responseText);
    }

    // Log agent action
    if (actions.length > 0) {
      for (const action of actions) {
        await supabase.from("whatsapp_agent_logs").insert({
          company_id: companyId,
          conversation_id: conversation.id,
          action: action.type,
          details: action.details,
        });
      }
    }

    // Log audio processing if applicable
    if (isAudio) {
      await supabase.from("whatsapp_agent_logs").insert({
        company_id: companyId,
        conversation_id: conversation.id,
        action: "audio_processed",
        details: {
          transcribed: true,
          responded_with_audio: isAudio && agentSettings.respond_audio_with_audio,
        },
      });
    }

    // Log response time
    const responseTimeMs = Date.now() - startTime;
    await supabase.from("whatsapp_agent_logs").insert({
      company_id: companyId,
      conversation_id: conversation.id,
      action: "response_sent",
      details: { response_time_ms: responseTimeMs, is_audio: isAudio },
    });

    return new Response(JSON.stringify({ ok: true, response: responseText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ========== AUDIO FUNCTIONS ==========

async function transcribeAudio(audioUrl: string, apiKey: string): Promise<string | null> {
  // Download the audio file
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.status}`);
  }
  const audioBlob = await audioResponse.blob();

  // Send to OpenAI Whisper API
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.ogg");
  formData.append("model", "whisper-1");
  formData.append("language", "pt");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Whisper error ${response.status}: ${errText}`);
  }

  const result = await response.json();
  return result.text || null;
}

async function generateTTS(text: string, voiceId: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs TTS error ${response.status}: ${errText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  return base64Encode(audioBuffer);
}

// ========== HELPER FUNCTIONS ==========

function extractPhone(body: any): string | null {
  return body?.phone || body?.from || body?.data?.from || body?.data?.key?.remoteJid?.replace("@s.whatsapp.net", "") || null;
}

function extractText(body: any): string | null {
  return body?.message || body?.text || body?.data?.message?.conversation || body?.data?.message?.extendedTextMessage?.text || null;
}

function extractType(body: any): string {
  if (body?.data?.message?.audioMessage || body?.type === "audio") return "audio";
  if (body?.data?.message?.documentMessage) return "pdf";
  if (body?.data?.message?.imageMessage) return "image";
  return "text";
}

function extractAudioUrl(body: any): string | null {
  // UAZAPI typically provides media URL in various formats
  return body?.mediaUrl || body?.media_url || body?.data?.mediaUrl || body?.data?.media_url || body?.data?.message?.audioMessage?.url || null;
}

async function gatherContext(supabase: any, companyId: string, phone: string, conversationId: string) {
  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("direction, content, message_type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  const cleanPhone = phone.replace(/\D/g, "");
  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, client_name, appointment_date, start_time, end_time, status, services(name), staff(name)")
    .eq("company_id", companyId)
    .or(`client_phone.eq.${cleanPhone},client_phone.eq.+${cleanPhone}`)
    .in("status", ["pending", "confirmed"])
    .order("appointment_date", { ascending: true })
    .limit(10);

  const { data: company } = await supabase
    .from("companies")
    .select("name, address, phone")
    .eq("id", companyId)
    .single();

  const { data: services } = await supabase
    .from("services")
    .select("name, duration, price, description")
    .eq("company_id", companyId)
    .eq("active", true);

  const { data: hours } = await supabase
    .from("business_hours")
    .select("day_of_week, open_time, close_time, is_open")
    .eq("company_id", companyId);

  const { data: knowledge } = await supabase
    .from("whatsapp_knowledge_base")
    .select("category, title, content")
    .eq("company_id", companyId)
    .eq("active", true);

  const { data: companySettings } = await supabase
    .from("company_settings")
    .select("slot_interval, max_capacity_per_slot, min_advance_hours")
    .eq("company_id", companyId)
    .single();

  return {
    messages: (messages || []).reverse(),
    appointments: appointments || [],
    company: company || {},
    services: services || [],
    hours: hours || [],
    knowledge: knowledge || [],
    companySettings: companySettings || {},
  };
}

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
2. Se o cliente quiser CANCELAR, verifique a política de cancelamento antes. Se dentro do prazo, peça confirmação e use "cancel_appointment".
3. Se o cliente quiser REAGENDAR, pergunte para qual dia e sugira horários disponíveis usando "check_availability". Depois use "reschedule_appointment".
4. Se o cliente pedir um "atendente" ou "humano", use "request_handoff".
5. Se houver mais de um agendamento ativo, pergunte qual deseja alterar antes de agir.
6. Nunca invente informações. Use apenas os dados fornecidos.
7. Mantenha as respostas curtas (máx 3 frases) quando possível.
8. Use emojis moderadamente para ser amigável.
9. Se a mensagem foi transcrita de áudio, trate normalmente como texto, mas responda de forma natural e conversacional.`;
}

async function callAI(supabase: any, companyId: string, context: any, userMessage: string, agentSettings: any) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = buildSystemPrompt(context, agentSettings);

  const chatMessages: any[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of context.messages) {
    if (msg.direction === "incoming") {
      chatMessages.push({ role: "user", content: msg.content || "" });
    } else {
      chatMessages.push({ role: "assistant", content: msg.content || "" });
    }
  }
  chatMessages.push({ role: "user", content: userMessage });

  const tools = [
    {
      type: "function",
      function: {
        name: "confirm_appointment",
        description: "Confirma um agendamento do cliente.",
        parameters: {
          type: "object",
          properties: {
            appointment_id: { type: "string", description: "ID do agendamento" },
          },
          required: ["appointment_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "cancel_appointment",
        description: "Cancela um agendamento do cliente.",
        parameters: {
          type: "object",
          properties: {
            appointment_id: { type: "string", description: "ID do agendamento" },
          },
          required: ["appointment_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "check_availability",
        description: "Verifica horários disponíveis em uma data específica.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Data no formato YYYY-MM-DD" },
            service_id: { type: "string", description: "ID do serviço (opcional)" },
          },
          required: ["date"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "reschedule_appointment",
        description: "Reagenda um agendamento para nova data e horário.",
        parameters: {
          type: "object",
          properties: {
            appointment_id: { type: "string", description: "ID do agendamento" },
            new_date: { type: "string", description: "Nova data YYYY-MM-DD" },
            new_time: { type: "string", description: "Novo horário HH:MM" },
          },
          required: ["appointment_id", "new_date", "new_time"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "request_handoff",
        description: "Transfere o atendimento para um humano.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
  ];

  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: chatMessages,
      tools,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI Gateway error:", response.status, errText);
    throw new Error(`AI error ${response.status}`);
  }

  return response.json();
}

async function processAIResponse(
  supabase: any, companyId: string, phone: string, conversation: any, aiResult: any, agentSettings: any
) {
  const choice = aiResult.choices?.[0];
  const actions: { type: string; details: any }[] = [];
  let responseText = choice?.message?.content || "";

  if (choice?.message?.tool_calls) {
    for (const toolCall of choice.message.tool_calls) {
      const fn = toolCall.function.name;
      let args: any = {};
      try { args = JSON.parse(toolCall.function.arguments); } catch { }

      if (fn === "confirm_appointment") {
        const { error } = await supabase
          .from("appointments")
          .update({ status: "confirmed" })
          .eq("id", args.appointment_id)
          .eq("company_id", companyId);
        if (!error) {
          actions.push({ type: "confirm", details: { appointment_id: args.appointment_id } });
          responseText = responseText || "✅ Seu agendamento foi confirmado com sucesso! Até lá! 😊";
        } else {
          responseText = responseText || "Desculpe, não consegui confirmar o agendamento. Tente novamente ou fale com um atendente.";
        }
      } else if (fn === "cancel_appointment") {
        const { error } = await supabase
          .from("appointments")
          .update({ status: "canceled" })
          .eq("id", args.appointment_id)
          .eq("company_id", companyId);
        if (!error) {
          actions.push({ type: "cancel", details: { appointment_id: args.appointment_id } });
          responseText = responseText || "❌ Seu agendamento foi cancelado. Se precisar de algo mais, estou aqui!";
        } else {
          responseText = responseText || "Desculpe, não consegui cancelar o agendamento. Tente novamente.";
        }
      } else if (fn === "reschedule_appointment") {
        const { data: appt } = await supabase
          .from("appointments")
          .select("service_id, services(duration)")
          .eq("id", args.appointment_id)
          .single();
        const duration = appt?.services?.duration || 30;
        const [h, m] = args.new_time.split(":").map(Number);
        const endMinutes = h * 60 + m + duration;
        const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

        const { error } = await supabase
          .from("appointments")
          .update({
            appointment_date: args.new_date,
            start_time: args.new_time,
            end_time: endTime,
            status: "pending",
          })
          .eq("id", args.appointment_id)
          .eq("company_id", companyId);
        if (!error) {
          actions.push({ type: "reschedule", details: { appointment_id: args.appointment_id, new_date: args.new_date, new_time: args.new_time } });
          responseText = responseText || `📅 Agendamento remarcado para ${formatDate(args.new_date)} às ${args.new_time}. Confirmado!`;
        } else {
          responseText = responseText || "Desculpe, não consegui reagendar. Tente novamente.";
        }
      } else if (fn === "check_availability") {
        const slots = await getAvailableSlots(supabase, companyId, args.date, args.service_id);
        if (slots.length === 0) {
          responseText = responseText || `Infelizmente não há horários disponíveis em ${formatDate(args.date)}. Gostaria de verificar outro dia?`;
        } else {
          const slotsStr = slots.slice(0, agentSettings.max_reschedule_suggestions || 5).join(", ");
          responseText = responseText || `📋 Horários disponíveis em ${formatDate(args.date)}:\n${slotsStr}\n\nQual horário prefere?`;
        }
        actions.push({ type: "check_availability", details: { date: args.date, slots_found: slots.length } });
      } else if (fn === "request_handoff") {
        await supabase
          .from("whatsapp_conversations")
          .update({ handoff_requested: true, status: "handoff" })
          .eq("id", conversation.id);
        actions.push({ type: "handoff", details: {} });
        responseText = responseText || "🙋 Entendi! Vou transferir você para um atendente humano. Aguarde um momento, por favor.";
      }
    }
  }

  if (!responseText) {
    responseText = "Desculpe, não entendi. Pode reformular? Ou digite 'atendente' para falar com alguém.";
  }

  return { responseText, actions };
}

async function getAvailableSlots(supabase: any, companyId: string, dateStr: string, serviceId?: string): Promise<string[]> {
  const date = new Date(dateStr + "T00:00:00");
  const dayOfWeek = date.getDay();

  const { data: bh } = await supabase
    .from("business_hours")
    .select("*")
    .eq("company_id", companyId)
    .eq("day_of_week", dayOfWeek)
    .single();

  if (!bh || !bh.is_open) return [];

  const { data: settings } = await supabase
    .from("company_settings")
    .select("slot_interval, max_capacity_per_slot")
    .eq("company_id", companyId)
    .single();

  const interval = settings?.slot_interval || 30;
  const maxCapacity = settings?.max_capacity_per_slot || 1;

  const { data: existing } = await supabase
    .from("appointments")
    .select("start_time, end_time")
    .eq("company_id", companyId)
    .eq("appointment_date", dateStr)
    .in("status", ["pending", "confirmed"]);

  const { data: blocks } = await supabase
    .from("time_blocks")
    .select("start_time, end_time")
    .eq("company_id", companyId)
    .eq("block_date", dateStr);

  const slots: string[] = [];
  const [openH, openM] = bh.open_time.split(":").map(Number);
  const [closeH, closeM] = bh.close_time.split(":").map(Number);
  let current = openH * 60 + openM;
  const end = closeH * 60 + closeM;

  while (current < end) {
    const slotTime = `${String(Math.floor(current / 60)).padStart(2, "0")}:${String(current % 60).padStart(2, "0")}`;

    const isBlocked = (blocks || []).some((b: any) => {
      if (!b.start_time && !b.end_time) return true;
      const bStart = timeToMin(b.start_time);
      const bEnd = timeToMin(b.end_time);
      return current >= bStart && current < bEnd;
    });

    if (!isBlocked) {
      const conflicts = (existing || []).filter((a: any) => {
        const aStart = timeToMin(a.start_time);
        const aEnd = timeToMin(a.end_time);
        return current >= aStart && current < aEnd;
      });
      if (conflicts.length < maxCapacity) {
        slots.push(slotTime);
      }
    }

    current += interval;
  }

  return slots;
}

function timeToMin(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

async function sendWhatsAppResponse(supabase: any, companyId: string, phone: string, message: string) {
  const { data: settings } = await supabase
    .from("whatsapp_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();

  if (!settings || !settings.active || !settings.base_url || !settings.instance_id || !settings.token) {
    console.error("WhatsApp settings not configured for company:", companyId);
    return;
  }

  const url = `${settings.base_url.replace(/\/$/, "")}/send/text`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: settings.token,
    },
    body: JSON.stringify({ number: phone.replace(/\D/g, ""), text: message }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("UAZAPI send error:", res.status, text);
  }
}

async function sendWhatsAppAudio(supabase: any, companyId: string, phone: string, audioBase64: string) {
  const { data: settings } = await supabase
    .from("whatsapp_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();

  if (!settings || !settings.active || !settings.base_url || !settings.instance_id || !settings.token) {
    console.error("WhatsApp settings not configured for company:", companyId);
    return;
  }

  const url = `${settings.base_url.replace(/\/$/, "")}/send/media`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: settings.token,
    },
    body: JSON.stringify({
      number: phone.replace(/\D/g, ""),
      mediatype: "audio",
      media: `data:audio/mp3;base64,${audioBase64}`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("UAZAPI sendAudio error:", res.status, text);
    // Fallback: send as text
    await sendWhatsAppResponse(supabase, companyId, phone, "[Áudio não pôde ser enviado] " + audioBase64.substring(0, 20) + "...");
  }
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
