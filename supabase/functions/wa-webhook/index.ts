const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function log(...args: any[]) {
  console.log("[wa-webhook]", new Date().toISOString(), ...args);
}

function extractButtonResponse(body: any): { buttonId: string; buttonText: string } | null {
  const msg = body.message;
  if (msg && typeof msg === "object") {
    const btnId = msg.buttonOrListid || msg.buttonId || msg.listResponseId || msg.selectedButtonId;
    if (btnId && typeof btnId === "string" && btnId.trim()) {
      const trimmedId = btnId.trim();
      // UAZAPI often puts the button ID in msg.text, so we need to detect that
      const rawText = msg.text || (typeof msg.content === "object" ? msg.content?.text : (typeof msg.content === "string" ? msg.content : null)) || msg.body || "";
      const rawTextStr = typeof rawText === "string" ? rawText.trim() : "";
      
      // If rawText equals the button ID, UAZAPI didn't provide the real label
      // Try to derive the display text from the semantic ID (e.g. "notif_canceled_sim" → "Sim")
      let btnText = rawTextStr;
      if (!rawTextStr || rawTextStr === trimmedId) {
        // Extract last meaningful segment from semantic ID as the display text
        // IDs are generated with: text.toLowerCase().replace(/[^a-z0-9]/g, '_')
        // So "Não" becomes "n_o", "Sim" becomes "sim"
        // We maintain a map of common button labels for accurate recovery
        const knownLabels: Record<string, string> = {
          // Respostas básicas
          "sim": "Sim",
          "n_o": "Não",
          "ok": "Ok",
          "talvez": "Talvez",
          // Ações de agendamento
          "agendar": "Agendar",
          "cancelar": "Cancelar",
          "confirmar": "Confirmar",
          "remarcar": "Remarcar",
          "reagendar": "Reagendar",
          "desmarcar": "Desmarcar",
          // Navegação
          "voltar": "Voltar",
          "pr_ximo": "Próximo",
          "anterior": "Anterior",
          "ver_mais": "Ver mais",
          "menu": "Menu",
          "inicio": "Início",
          "in_cio": "Início",
          "sair": "Sair",
          "fechar": "Fechar",
          // Status
          "dispon_vel": "Disponível",
          "indispon_vel": "Indisponível",
          "aberto": "Aberto",
          "fechado": "Fechado",
          "ativo": "Ativo",
          "inativo": "Inativo",
          // Termos de serviço/negócio
          "hor_rio": "Horário",
          "hor_rios": "Horários",
          "servi_os": "Serviços",
          "servi_o": "Serviço",
          "informa__es": "Informações",
          "informa__o": "Informação",
          "endere_o": "Endereço",
          "pre_o": "Preço",
          "pre_os": "Preços",
          "promo__o": "Promoção",
          "promo__es": "Promoções",
          "pagamento": "Pagamento",
          "pix": "Pix",
          "cart_o": "Cartão",
          "dinheiro": "Dinheiro",
          // Profissionais
          "profissional": "Profissional",
          "profissionais": "Profissionais",
          "qualquer_um": "Qualquer um",
          "sem_prefer_ncia": "Sem preferência",
          // Cortesias
          "obrigado": "Obrigado",
          "obrigada": "Obrigada",
          // Dias da semana
          "segunda": "Segunda",
          "ter_a": "Terça",
          "quarta": "Quarta",
          "quinta": "Quinta",
          "sexta": "Sexta",
          "s_bado": "Sábado",
          "domingo": "Domingo",
          // Períodos
          "manh_": "Manhã",
          "tarde": "Tarde",
          "noite": "Noite",
          // Outros
          "ajuda": "Ajuda",
          "atendente": "Atendente",
          "humano": "Humano",
          "falar_com_humano": "Falar com humano",
          "outro": "Outro",
          "outros": "Outros",
          "outra_data": "Outra data",
          "outro_hor_rio": "Outro horário",
        };

        const parts = trimmedId.split("_");
        const prefixes = ["notif", "svc", "slot", "btn"];
        let labelParts = [...parts];
        // Remove prefix
        if (prefixes.includes(parts[0])) labelParts = labelParts.slice(1);
        // For notif_ IDs, also skip the status
        if (parts[0] === "notif" && labelParts.length > 1) {
          const statuses = ["canceled", "confirmed", "pending", "rescheduled", "completed"];
          if (statuses.includes(labelParts[0])) labelParts = labelParts.slice(1);
        }
        
        // Try to match the remaining part against known labels
        const labelKey = labelParts.join("_");
        if (knownLabels[labelKey]) {
          btnText = knownLabels[labelKey];
          log("🏷️ Button label resolved via exact match:", labelKey, "→", btnText);
        } else {
          log("⚠️ UNMAPPED BUTTON LABEL - labelKey:", labelKey, "fullId:", trimmedId, "- consider adding to knownLabels map");

          // Intelligent fallback: try sub-segment matching
          const subSegments = labelKey.split("_");
          const subRecovered: string[] = [];
          const unmatchedSegments: string[] = [];
          let i = 0;
          while (i < subSegments.length) {
            let matched = false;
            for (let len = Math.min(subSegments.length - i, 4); len >= 1; len--) {
              const subKey = subSegments.slice(i, i + len).join("_");
              if (knownLabels[subKey]) {
                subRecovered.push(knownLabels[subKey]);
                log("🏷️ Sub-segment matched:", subKey, "→", knownLabels[subKey]);
                i += len;
                matched = true;
                break;
              }
            }
            if (!matched) {
              unmatchedSegments.push(subSegments[i]);
              subRecovered.push(subSegments[i]);
              i++;
            }
          }
          
          if (unmatchedSegments.length > 0) {
            log("⚠️ UNMATCHED SUB-SEGMENTS:", unmatchedSegments.join(", "), "from labelKey:", labelKey);
          }
          
          btnText = subRecovered.join(" ") || trimmedId;
          btnText = btnText.replace(/\s+/g, " ").trim();
          btnText = btnText.charAt(0).toUpperCase() + btnText.slice(1);
          log("🏷️ Fallback result:", btnText);
        }
      }
      
      log("🔘 Button/List response detected! id:", trimmedId, "text:", btnText);
      return { buttonId: trimmedId, buttonText: btnText };
    }
  }
  return null;
}

function extractMessageText(body: any): string | null {
  // Check for button/list response first — use the button text as the message
  const btnResponse = extractButtonResponse(body);
  if (btnResponse) {
    return btnResponse.buttonText;
  }

  // Direct string fields
  if (typeof body.message === "string") return body.message;
  if (typeof body.text === "string") return body.text;

  // UAZAPI format: message is an object with conversation or extendedTextMessage
  const msg = body.message;
  if (msg && typeof msg === "object") {
    if (typeof msg.conversation === "string") return msg.conversation;
    if (typeof msg.extendedTextMessage?.text === "string") return msg.extendedTextMessage.text;
    if (typeof msg.imageMessage?.caption === "string") return msg.imageMessage.caption;
    if (typeof msg.videoMessage?.caption === "string") return msg.videoMessage.caption;
    if (typeof msg.documentMessage?.caption === "string") return msg.documentMessage.caption;
    if (typeof msg.body === "string") return msg.body;
    if (typeof msg.text === "string") return msg.text;
  }

  // UAZAPI nested data format
  const data = body.data;
  if (data) {
    if (typeof data.message === "string") return data.message;
    if (data.message && typeof data.message === "object") {
      if (typeof data.message.conversation === "string") return data.message.conversation;
      if (typeof data.message.extendedTextMessage?.text === "string") return data.message.extendedTextMessage.text;
    }
  }

  // UAZAPI chat-level message text
  if (typeof body.chat?.lastMessage === "string") return body.chat.lastMessage;
  if (typeof body.chat?.last_message === "string") return body.chat.last_message;

  // Try body.msg
  if (typeof body.msg === "string") return body.msg;

  return null;
}

function detectAudioMessage(body: any): { isAudio: boolean; mediaUrl: string | null; mediaKey: string | null; messageId: string | null; whatsappMsgId: string | null; chatId: string | null } {
  const msg = body.message;
  if (msg && typeof msg === "object") {
    // UAZAPI: messageType or type indicates audio
    const msgType = msg.messageType || msg.type || "";
    const mediaType = msg.mediaType || "";
    
    const isAudioType = msgType === "audioMessage" || msgType === "AudioMessage" || msgType === "pttMessage" || msgType === "audio" || msgType === "ptt" 
      || mediaType === "audio" || mediaType === "ptt" || !!msg.audioMessage;
    
    if (isAudioType) {
      // Try to get media URL from various UAZAPI fields
      // UAZAPI stores the URL inside msg.content.URL for audio messages (encrypted WhatsApp CDN)
      const mediaUrl = msg.content?.URL || msg.content?.url || msg.mediaUrl || msg.media_url || msg.url || msg.audioMessage?.url || msg.audioMessage?.mediaUrl || null;
      // Extract mediaKey for WhatsApp E2E decryption
      const mediaKey = msg.content?.mediaKey || msg.audioMessage?.mediaKey || null;
      // UAZAPI internal ID (hex format)
      const messageId = msg.messageid || msg.messageId || null;
      // WhatsApp message ID (format like "5511...:3EB0...")
      const whatsappMsgId = msg.id || body.key?.id || null;
      // Chat ID for download endpoint
      const chatId = msg.chatid || msg.sender || body.key?.remoteJid || null;
      
      // Log content details for debugging
      const contentKeys = msg.content && typeof msg.content === "object" ? Object.keys(msg.content).join(",") : "N/A";
      
      log("🎵 Audio detected! msgType:", msgType, "mediaType:", mediaType, 
        "mediaUrl:", mediaUrl ? "yes" : "no", 
        "mediaKey:", mediaKey ? "yes" : "no",
        "messageid:", messageId, "wa_id:", whatsappMsgId,
        "chatid:", chatId,
        "content_type:", typeof msg.content, 
        "content_keys:", contentKeys,
        "content_len:", typeof msg.content === "string" ? msg.content.length : 0);
      
      return { isAudio: true, mediaUrl: typeof mediaUrl === "string" ? mediaUrl : null, mediaKey: typeof mediaKey === "string" ? mediaKey : null, messageId, whatsappMsgId, chatId };
    }
  }
  return { isAudio: false, mediaUrl: null, mediaKey: null, messageId: null, whatsappMsgId: null, chatId: null };
}

function detectMediaMessage(body: any): { isMedia: boolean; mediaType: "image" | "document" | null; mediaUrl: string | null; mediaKey: string | null; messageId: string | null; mimeType: string | null; caption: string | null } {
  const msg = body.message;
  if (msg && typeof msg === "object") {
    const msgType = msg.messageType || msg.type || "";

    // Image message
    const isImage = msgType === "imageMessage" || msgType === "ImageMessage" || !!msg.imageMessage;
    if (isImage) {
      const imgMsg = msg.imageMessage || msg;
      const mediaUrl = msg.content?.URL || msg.content?.url || imgMsg.url || imgMsg.mediaUrl || msg.mediaUrl || null;
      const mediaKey = msg.content?.mediaKey || imgMsg.mediaKey || null;
      const messageId = msg.messageid || msg.messageId || null;
      const mimeType = imgMsg.mimetype || "image/jpeg";
      const caption = imgMsg.caption || msg.caption || null;
      log("🖼️ Image detected! mediaUrl:", mediaUrl ? "yes" : "no", "mimeType:", mimeType, "caption:", caption);
      return { isMedia: true, mediaType: "image", mediaUrl: typeof mediaUrl === "string" ? mediaUrl : null, mediaKey: typeof mediaKey === "string" ? mediaKey : null, messageId, mimeType, caption };
    }

    // Document (PDF, etc.) message
    const isDocument = msgType === "documentMessage" || msgType === "DocumentMessage" || !!msg.documentMessage;
    if (isDocument) {
      const docMsg = msg.documentMessage || msg;
      const mediaUrl = msg.content?.URL || msg.content?.url || docMsg.url || docMsg.mediaUrl || msg.mediaUrl || null;
      const mediaKey = msg.content?.mediaKey || docMsg.mediaKey || null;
      const messageId = msg.messageid || msg.messageId || null;
      const mimeType = docMsg.mimetype || "application/pdf";
      const caption = docMsg.caption || docMsg.fileName || msg.caption || null;
      log("📄 Document detected! mediaUrl:", mediaUrl ? "yes" : "no", "mimeType:", mimeType, "caption:", caption);
      return { isMedia: true, mediaType: "document", mediaUrl: typeof mediaUrl === "string" ? mediaUrl : null, mediaKey: typeof mediaKey === "string" ? mediaKey : null, messageId, mimeType, caption };
    }
  }
  return { isMedia: false, mediaType: null, mediaUrl: null, mediaKey: null, messageId: null, mimeType: null, caption: null };
}

function isGroupMessage(body: any): boolean {
  const msg = body.message;
  if (msg && typeof msg === "object") {
    const chatid = msg.chatid || msg.chat_id || "";
    if (typeof chatid === "string" && chatid.includes("@g.us")) return true;
    const sender = msg.sender || "";
    if (typeof sender === "string" && sender.includes("@g.us")) return true;
  }
  if (body.key?.remoteJid && typeof body.key.remoteJid === "string" && body.key.remoteJid.includes("@g.us")) return true;
  if (body.data?.key?.remoteJid && typeof body.data.key.remoteJid === "string" && body.data.key.remoteJid.includes("@g.us")) return true;
  if (body.chat?.jid && typeof body.chat.jid === "string" && body.chat.jid.includes("@g.us")) return true;
  if (body.remoteJid && typeof body.remoteJid === "string" && body.remoteJid.includes("@g.us")) return true;
  return false;
}

function extractPhone(body: any): string | null {
  const clean = (jid: string) => jid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace(/\D/g, "");
  const isLid = (jid: string) => jid.includes("@lid") || jid.includes("@g.us");
  
  // Direct fields
  if (body.phone) return String(body.phone);
  if (body.from) return String(body.from);

  // UAZAPI: message object - prioritize sender_pn (actual phone number) over sender/chatid (which may be LIDs)
  const msg = body.message;
  if (msg && typeof msg === "object") {
    // sender_pn is the REAL phone number in UAZAPI format — always prefer this
    if (typeof msg.sender_pn === "string" && msg.sender_pn.trim()) {
      const pn = msg.sender_pn.replace("@s.whatsapp.net", "").replace("@c.us", "").replace(/\D/g, "");
      if (pn) {
        log("📱 Phone from sender_pn:", pn);
        return pn;
      }
    }
    // sender JID — skip LID-based values
    if (typeof msg.sender === "string" && msg.sender.includes("@") && !isLid(msg.sender)) return clean(msg.sender);
    // chatid — skip LID and group-based values
    if (typeof msg.chatid === "string" && msg.chatid.includes("@") && !isLid(msg.chatid)) return clean(msg.chatid);
  }

  // UAZAPI: key.remoteJid
  if (body.key?.remoteJid) return clean(body.key.remoteJid);
  if (body.data?.key?.remoteJid) return clean(body.data.key.remoteJid);

  // UAZAPI: chat.phone or chat.jid
  if (body.chat?.phone) return String(body.chat.phone);
  if (body.chat?.jid) return clean(body.chat.jid);

  // UAZAPI: remoteJid at top level
  if (body.remoteJid) return clean(body.remoteJid);

  // data.from
  if (body.data?.from) return String(body.data.from);

  return null;
}

function isFromMe(body: any): boolean {
  if (body.fromMe === true) return true;
  if (body.data?.fromMe === true) return true;
  if (body.key?.fromMe === true) return true;
  if (body.data?.key?.fromMe === true) return true;
  // UAZAPI: event.IsFromMe
  if (body.event?.IsFromMe === true) return true;
  // UAZAPI: message object has fromMe directly (most common UAZAPI format)
  if (body.message?.fromMe === true) return true;
  // UAZAPI: message sent via API
  if (body.message?.wasSentByApi === true) return true;
  // UAZAPI: check if sender matches the instance owner (business number)
  const owner = body.owner;
  if (owner) {
    const phone = extractPhone(body);
    if (phone && owner.replace(/\D/g, "") === phone.replace(/\D/g, "")) return true;
  }
  // UAZAPI: message sent by instance has "fromMe" in nested message key
  if (body.message?.key?.fromMe === true) return true;
  return false;
}

Deno.serve(async (req) => {
  log("🔵 REQUEST:", req.method, req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // Extract company_id from PATH: /wa-webhook/{company_id}
    const pathParts = url.pathname.split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    let companyId = (lastPart && lastPart !== "wa-webhook") 
      ? lastPart 
      : url.searchParams.get("company_id");

    log("🔵 company_id (from URL):", companyId, "path:", url.pathname);

    if (!companyId) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "no_company_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const raw = await req.text();
    log("🔵 Raw body (1000):", raw.substring(0, 1000));

    let body: any;
    try { body = JSON.parse(raw); } catch {
      return new Response(
        JSON.stringify({ ok: true, skipped: "bad_json" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Resolve correct company_id and instance_id from UAZAPI instanceName/token ──
    // The global webhook may route all messages to a single URL, but the payload
    // contains the instanceName which maps to the actual owning company.
    const payloadInstanceName = body.instanceName || body.instance_name || null;
    const payloadToken = body.token || null;
    let resolvedInstanceId: string | null = null; // NEW: per-instance ID for agent settings lookup

    if (payloadInstanceName || payloadToken) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const sb = createClient(supabaseUrl, serviceKey);
        
        let resolvedCompanyId: string | null = null;
        
        // Try by instance_name in whatsapp_instances table (most reliable for multi-instance)
        if (payloadInstanceName) {
          const { data: instRow } = await sb.from("whatsapp_instances")
            .select("company_id, id")
            .eq("instance_name", payloadInstanceName)
            .maybeSingle();
          if (instRow?.company_id) {
            resolvedCompanyId = instRow.company_id;
            resolvedInstanceId = instRow.id; // capture the instance DB id
          }
        }
        
        // Fallback: try by token in whatsapp_instances
        if (!resolvedCompanyId && payloadToken) {
          const { data: instRow } = await sb.from("whatsapp_instances")
            .select("company_id, id")
            .eq("token", payloadToken)
            .maybeSingle();
          if (instRow?.company_id) {
            resolvedCompanyId = instRow.company_id;
            resolvedInstanceId = instRow.id;
          }
        }
        
        // Final fallback: old whatsapp_settings table
        if (!resolvedCompanyId && payloadInstanceName) {
          const { data } = await sb.from("whatsapp_settings")
            .select("company_id")
            .eq("instance_id", payloadInstanceName)
            .maybeSingle();
          if (data?.company_id) resolvedCompanyId = data.company_id;
        }
        if (!resolvedCompanyId && payloadToken) {
          const { data } = await sb.from("whatsapp_settings")
            .select("company_id")
            .eq("token", payloadToken)
            .maybeSingle();
          if (data?.company_id) resolvedCompanyId = data.company_id;
        }
        
        if (resolvedCompanyId && resolvedCompanyId !== companyId) {
          log("🔄 Company ID resolved from instance:", payloadInstanceName, "URL:", companyId, "→ Actual:", resolvedCompanyId, "instance_id:", resolvedInstanceId);
          companyId = resolvedCompanyId;
        } else if (resolvedInstanceId) {
          log("🔄 Instance ID resolved:", resolvedInstanceId, "for company:", companyId);
        }
      } catch (resolveErr) {
        log("⚠️ Could not resolve company from instance:", resolveErr);
        // Continue with URL-based company_id as fallback
      }
    }

    // Extract event type from UAZAPI payload
    const eventType = body.EventType || body.event_type || body.type || null;

    // Log the EventType and key structure for debugging
    log("🔵 EventType:", eventType, "keys:", Object.keys(body).join(","));
    if (body.key) log("🔵 key:", JSON.stringify(body.key));
    if (body.message) log("🔵 message type:", typeof body.message, "keys:", body.message && typeof body.message === "object" ? Object.keys(body.message).join(",") : "N/A");

    // ── Handle messages_update events (delivery status: Delivered, Read, etc.) ──
    if (eventType === "messages_update") {
      const ev = body.event;
      if (ev && ev.MessageIDs && ev.Type) {
        const statusMap: Record<string, string> = {
          "Sent": "sent", "Delivered": "delivered", "Read": "read", "Failed": "failed",
        };
        const newStatus = statusMap[ev.Type];
        if (newStatus) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
          const sb = createClient(supabaseUrl, serviceKey);
          
          for (const msgId of ev.MessageIDs) {
            const { error } = await sb.from("whatsapp_messages")
              .update({ delivery_status: newStatus })
              .eq("wa_message_id", msgId);
            if (!error) {
              log("📬 Delivery status updated:", msgId, "→", newStatus);
            }
          }
        }
      }
      return new Response(
        JSON.stringify({ ok: true, handled: "messages_update" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Handle reaction events ──
    if (eventType === "messages_reaction" || eventType === "reactions") {
      const msg = body.message || body.event;
      const emoji = msg?.reaction?.text || msg?.reactionMessage?.text || body.reaction?.text;
      const reactedMsgId = msg?.reaction?.key?.id || msg?.reactionMessage?.key?.id || body.reaction?.key?.id;
      const reactPhone = extractPhone(body);
      
      if (emoji && reactPhone && !isFromMe(body)) {
        log("😀 Reaction received! emoji:", emoji, "phone:", reactPhone, "msgId:", reactedMsgId);
        
        // Forward reaction to send-whatsapp for processing as a trigger
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const forwardUrl = `${supabaseUrl}/functions/v1/send-whatsapp`;
        
        const res = await fetch(forwardUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            action: "reaction-trigger",
            company_id: companyId,
            phone: reactPhone,
            emoji,
            reacted_message_id: reactedMsgId,
          }),
        });
        const result = await res.text();
        log("😀 Reaction trigger result:", res.status, result.substring(0, 200));
        
        return new Response(result, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(
        JSON.stringify({ ok: true, handled: "reaction" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip other non-message events (chats updates, etc.)
    if (eventType && eventType !== "messages" && eventType !== "message" && eventType !== "Message") {
      log("📩 Skipping non-message event:", eventType);
      return new Response(
        JSON.stringify({ ok: true, skipped: "non_message_event", eventType }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Detect reaction inside regular "messages" event ──
    const msgObj = body.message;
    if (msgObj && typeof msgObj === "object" && (msgObj.messageType === "reactionMessage" || (msgObj.reaction && typeof msgObj.reaction === "object" && msgObj.reaction.text))) {
      const emoji = msgObj.reaction?.text;
      const reactedMsgId = msgObj.reaction?.key?.id || msgObj.reaction?.id;
      const reactPhone = extractPhone(body);
      
      log("😀 Reaction detected inside messages event! emoji:", emoji, "phone:", reactPhone, "msgId:", reactedMsgId, "messageType:", msgObj.messageType);
      
      if (emoji && reactPhone && !isFromMe(body)) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const forwardUrl = `${supabaseUrl}/functions/v1/send-whatsapp`;
        
        const res = await fetch(forwardUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            action: "reaction-trigger",
            company_id: companyId,
            phone: reactPhone,
            emoji,
            reacted_message_id: reactedMsgId,
          }),
        });
        const result = await res.text();
        log("😀 Reaction trigger result:", res.status, result.substring(0, 200));
        
        return new Response(result, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(
        JSON.stringify({ ok: true, handled: "reaction_in_message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log fromMe detection details
    log("🔵 fromMe check:", 
      "body.fromMe:", body.fromMe, 
      "key.fromMe:", body.key?.fromMe,
      "msg.fromMe:", body.message?.fromMe,
      "msg.wasSentByApi:", body.message?.wasSentByApi,
      "event.IsFromMe:", body.event?.IsFromMe,
      "owner:", body.owner
    );

    if (isFromMe(body)) {
      log("📩 Skipping fromMe");
      return new Response(
        JSON.stringify({ ok: true, skipped: "from_me" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Check if message is from a group and if we should ignore it ──
    if (isGroupMessage(body)) {
      const { createClient: createClientGrp } = await import("https://esm.sh/@supabase/supabase-js@2");
      const sbGrp = createClientGrp(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      
      // Look up instance-specific settings first, then company default
      let agentSettingsData: any = null;
      if (resolvedInstanceId) {
        const { data } = await sbGrp.from("whatsapp_agent_settings").select("ignore_groups").eq("company_id", companyId).eq("instance_id", resolvedInstanceId).maybeSingle();
        agentSettingsData = data;
      }
      if (!agentSettingsData) {
        const { data } = await sbGrp.from("whatsapp_agent_settings").select("ignore_groups").eq("company_id", companyId).is("instance_id", null).maybeSingle();
        agentSettingsData = data;
      }
      
      if (agentSettingsData?.ignore_groups !== false) {
        log("👥 Skipping group message (ignore_groups enabled)");
        return new Response(
          JSON.stringify({ ok: true, skipped: "group_message" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const phone = extractPhone(body);
    const msg = extractMessageText(body);

    log("📩 phone:", phone, "msg:", msg?.substring(0, 100));

    // Check if this is an audio message
    const audioInfo = detectAudioMessage(body);
    // Check if this is an image or document message
    const mediaInfo = detectMediaMessage(body);

    if (!phone || (!msg && !audioInfo.isAudio && !mediaInfo.isMedia)) {
      log("⚠️ Could not extract phone/msg. Full body keys:", JSON.stringify(Object.keys(body)));
      if (body.chat) log("⚠️ chat keys:", Object.keys(body.chat).join(","));
      return new Response(
        JSON.stringify({ ok: true, skipped: "no_msg", phone, hasMsg: !!msg, isAudio: audioInfo.isAudio, isMedia: mediaInfo.isMedia }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Extract the unique WhatsApp message ID from the payload ──
    const waMessageId: string | null =
      body.message?.messageid ||
      body.message?.id ||
      body.key?.id ||
      body.data?.key?.id ||
      body.data?.messageId ||
      null;

    log("📩 wa_message_id:", waMessageId);

    // ── DEDUPLICATION GATE ──
    if (waMessageId) {
      const { createClient: createClientDedup } = await import("https://esm.sh/@supabase/supabase-js@2");
      const dedupSb = createClientDedup(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      const { data: existingMsg } = await dedupSb
        .from("whatsapp_messages")
        .select("id")
        .eq("wa_message_id", waMessageId)
        .eq("direction", "incoming")
        .limit(1)
        .maybeSingle();

      if (existingMsg) {
        log("🔁 wa_message_id already in DB — duplicate webhook delivery, skipping:", waMessageId);
        return new Response(JSON.stringify({ ok: true, skipped: "duplicate_wa_id", wa_message_id: waMessageId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Forward to send-whatsapp
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const forwardUrl = `${supabaseUrl}/functions/v1/send-whatsapp`;

    const btnResponse = extractButtonResponse(body);
    const effectiveMsg = msg || (audioInfo.isAudio ? "[áudio]" : mediaInfo.isMedia ? `[${mediaInfo.mediaType === "image" ? "imagem" : "documento"}]` : "");

    // ── Message Debounce / Aggregation (only for text, non-button messages) ──
    const isTextMsg = !audioInfo.isAudio && !mediaInfo.isMedia && !btnResponse;
    if (isTextMsg && effectiveMsg) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const sb = createClient(supabaseUrl, serviceKey);

      // Load agent settings — prefer instance-specific, fall back to company default
      let agSettings: any = null;
      if (resolvedInstanceId) {
        const { data } = await sb.from("whatsapp_agent_settings").select("message_delay_enabled, message_delay_seconds, enabled").eq("company_id", companyId).eq("instance_id", resolvedInstanceId).maybeSingle();
        agSettings = data;
      }
      if (!agSettings) {
        const { data } = await sb.from("whatsapp_agent_settings").select("message_delay_enabled, message_delay_seconds, enabled").eq("company_id", companyId).is("instance_id", null).maybeSingle();
        agSettings = data;
      }

      if (agSettings?.enabled && agSettings?.message_delay_enabled) {
        const delaySeconds = Math.max(2, Math.min(30, agSettings.message_delay_seconds || 8));
        log("⏳ Debounce enabled:", delaySeconds, "s");

        // Get or create conversation — scoped to this specific instance
        let convQuery = sb
          .from("whatsapp_conversations")
          .select("id, handoff_requested")
          .eq("company_id", companyId)
          .eq("phone", phone)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1);

        // Filter by instance_id to isolate each WhatsApp number's conversation
        if (resolvedInstanceId) {
          convQuery = convQuery.eq("instance_id", resolvedInstanceId);
        } else {
          convQuery = convQuery.is("instance_id", null);
        }

        let { data: conv } = await convQuery.single();

        if (!conv) {
          const insertConv: any = { company_id: companyId, phone, status: "active" };
          if (resolvedInstanceId) insertConv.instance_id = resolvedInstanceId;
          const { data: nc } = await sb
            .from("whatsapp_conversations")
            .insert(insertConv)
            .select("id, handoff_requested")
            .single();
          conv = nc;
        }

        if (conv?.id && !conv.handoff_requested) {
          const convId = conv.id;
          const arrivalMs = Date.now();

          // Save this message as pending — include wa_message_id so later deduplication works
          await sb.from("whatsapp_messages").insert({
            conversation_id: convId,
            company_id: companyId,
            direction: "incoming",
            message_type: "text",
            content: effectiveMsg,
            delivery_status: "pending",
            wa_message_id: waMessageId,
            metadata: { buffered: true, arrival_ms: arrivalMs, wa_message_id: waMessageId },
          });
          log("⏳ Message saved as pending, wa_message_id:", waMessageId);

          // Try to acquire processing LOCK
          const lockWindowStart = new Date(arrivalMs - (delaySeconds + 60) * 1000).toISOString();
          const { data: existingLock } = await sb
            .from("whatsapp_messages")
            .select("id")
            .eq("conversation_id", convId)
            .eq("direction", "outgoing")
            .eq("delivery_status", "locking")
            .gte("created_at", lockWindowStart)
            .limit(1)
            .single();

          if (existingLock) {
            log("⏳ Lock held by another worker — exiting.");
            return new Response(JSON.stringify({ ok: true, skipped: "lock_held_by_other" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Acquire lock
          const { data: lockRow, error: lockErr } = await sb.from("whatsapp_messages").insert({
            conversation_id: convId,
            company_id: companyId,
            direction: "outgoing",
            message_type: "text",
            content: "__DEBOUNCE_LOCK__",
            delivery_status: "locking",
            metadata: { lock: true, acquired_ms: arrivalMs, delay_seconds: delaySeconds },
          }).select("id").single();

          if (!lockErr && lockRow?.id) {
            const lockId = lockRow.id;
            log("⏳ 🔒 Lock acquired! Waiting", delaySeconds, "s...");

            // Wait the debounce delay
            await new Promise(r => setTimeout(r, delaySeconds * 1000));

            // Collect all pending messages — order by created_at ASC to preserve arrival order
            const bufferWindowStart = new Date(arrivalMs - 5000).toISOString();
            const { data: bufferedMsgs } = await sb
              .from("whatsapp_messages")
              .select("id, content, created_at, wa_message_id")
              .eq("conversation_id", convId)
              .eq("direction", "incoming")
              .eq("delivery_status", "pending")
              .gte("created_at", bufferWindowStart)
              .order("created_at", { ascending: true });

            // Release lock
            try { await sb.from("whatsapp_messages").delete().eq("id", lockId); } catch {}
            log("⏳ 🔓 Lock released. Buffered msgs:", bufferedMsgs?.length || 0);

            if (!bufferedMsgs || bufferedMsgs.length === 0) {
              return new Response(JSON.stringify({ ok: true, skipped: "no_pending_after_delay" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            // Mark all as processed (read) — keep individual wa_message_ids in metadata
            const msgIds = bufferedMsgs.map((m: any) => m.id);
            const aggregatedWaIds = bufferedMsgs.map((m: any) => m.wa_message_id).filter(Boolean);
            await sb.from("whatsapp_messages")
              .update({
                delivery_status: "read",
                metadata: { buffered: false, aggregated: true, source_count: bufferedMsgs.length, wa_message_ids: aggregatedWaIds },
              })
              .in("id", msgIds);

            // Concatenate all messages in arrival order (separated by newline)
            const concatenatedMsg = bufferedMsgs
              .map((m: any) => m.content?.trim())
              .filter(Boolean)
              .join("\n");
            log("⏳ Aggregated (", bufferedMsgs.length, "msgs):", concatenatedMsg.substring(0, 200));
            log("⏳ Aggregated wa_ids:", aggregatedWaIds.join(", "));

            // Forward aggregated message to send-whatsapp with skipIncomingSave
            const aggregatedBody = {
              action: "agent-process",
              company_id: companyId,
              phone,
              message: concatenatedMsg,
              wa_message_id: waMessageId,
              wa_message_ids: aggregatedWaIds,
              skip_incoming_save: true,
              existing_conv_id: convId,
              instance_id: resolvedInstanceId, // per-instance agent settings
            };

            const res = await fetch(forwardUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify(aggregatedBody),
            });

            const result = await res.text();
            log("✅ Aggregated result:", res.status, result.substring(0, 200));
            return new Response(result, {
              status: res.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else if (conv?.handoff_requested) {
          log("⏳ Handoff active, skipping agent");
          return new Response(JSON.stringify({ ok: true, skipped: "handoff" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Fallback: no debounce (audio, media, button responses, or debounce disabled)
    log("🚀 Forwarding to:", forwardUrl, audioInfo.isAudio ? "(AUDIO)" : mediaInfo.isMedia ? `(MEDIA:${mediaInfo.mediaType})` : btnResponse ? "(BUTTON)" : "(TEXT-no-debounce)");

    const forwardBody: any = {
      action: "agent-process",
      company_id: companyId,
      phone,
      message: effectiveMsg,
      wa_message_id: waMessageId,
      instance_id: resolvedInstanceId, // pass instance_id so agent uses correct settings
    };

    if (btnResponse) {
      forwardBody.button_response_id = btnResponse.buttonId;
      forwardBody.button_response_text = btnResponse.buttonText;
      log("🔘 Forwarding button response: id:", btnResponse.buttonId, "text:", btnResponse.buttonText, "wa_id:", waMessageId);
    }

    if (audioInfo.isAudio) {
      forwardBody.is_audio = true;
      forwardBody.audio_media_url = audioInfo.mediaUrl;
      forwardBody.audio_media_key = audioInfo.mediaKey;
      forwardBody.audio_message_id = audioInfo.messageId;
      forwardBody.audio_wa_msg_id = audioInfo.whatsappMsgId;
      forwardBody.audio_chat_id = audioInfo.chatId;
    }

    if (mediaInfo.isMedia) {
      forwardBody.is_media = true;
      forwardBody.media_type = mediaInfo.mediaType;
      forwardBody.media_url = mediaInfo.mediaUrl;
      forwardBody.media_key = mediaInfo.mediaKey;
      forwardBody.media_message_id = mediaInfo.messageId;
      forwardBody.media_mime_type = mediaInfo.mimeType;
      forwardBody.media_caption = mediaInfo.caption;
    }

    const res = await fetch(forwardUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(forwardBody),
    });

    const result = await res.text();
    log("✅ Result:", res.status, result.substring(0, 300));

    return new Response(result, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    log("❌ ERROR:", e.message);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});