import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const jsonH = { ...corsHeaders, "Content-Type": "application/json" };

interface SendRequest {
  appointment_id?: string;
  company_id: string;
  type: "confirmation" | "reminder" | "cancellation" | "reschedule" | "confirmation_request" | "test";
  phone?: string;
}

function replacePlaceholders(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || "");
}

function log(...args: any[]) {
  console.log("[send-whatsapp]", new Date().toISOString(), ...args);
}

function logErr(...args: any[]) {
  console.error("[send-whatsapp]", new Date().toISOString(), ...args);
}

Deno.serve(async (req) => {
  log("🔵 REQUEST RECEIVED", req.method, req.url);
  log("🔵 Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));

  if (req.method === "OPTIONS") {
    log("🔵 CORS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const raw = await req.text();
    log("🔵 RAW BODY (first 500):", raw.substring(0, 500));
    log("🔵 RAW BODY length:", raw.length);

    let body: any;
    try {
      body = JSON.parse(raw);
      log("🔵 PARSED JSON keys:", Object.keys(body));
    } catch (e) {
      log("⚠️ BAD JSON, skipping:", e);
      return new Response(JSON.stringify({ ok: true, skipped: "bad_json" }), { headers: jsonH });
    }

    // ─── Detect UAZAPI webhook payload ───
    const urlParams = new URL(req.url).searchParams;
    const uazapiCompanyId = urlParams.get("company_id") || body.company_id_webhook;
    log("🔵 company_id from URL:", urlParams.get("company_id"), "from body:", body.company_id_webhook, "final:", uazapiCompanyId);
    log("🔵 body.type:", body.type, "body.action:", body.action, "body.event:", body.event);

    const isUazapiWebhook = uazapiCompanyId && !body.type && !body.action && (
      body.event || body.data || (body.phone && body.message && !body.appointment_id)
    );
    log("🔵 isUazapiWebhook:", isUazapiWebhook);

    if (isUazapiWebhook) {
      log("📩 UAZAPI WEBHOOK DETECTED, cid:", uazapiCompanyId);

      const phone = body.phone || body.from || body.data?.from ||
        body.data?.key?.remoteJid?.replace("@s.whatsapp.net", "") || null;
      const msg = body.message || body.text || body.data?.message?.conversation ||
        body.data?.message?.extendedTextMessage?.text || null;

      log("📩 Extracted phone:", phone, "msg:", msg?.substring(0, 100));
      log("📩 body.phone:", body.phone, "body.from:", body.from);
      log("📩 body.message:", body.message, "body.text:", body.text);
      log("📩 body.data:", JSON.stringify(body.data)?.substring(0, 300));

      // Check if message is from the business itself (fromMe)
      const fromMe = body.fromMe === true || body.data?.fromMe === true;
      log("📩 fromMe:", fromMe);
      if (fromMe) {
        log("📩 Skipping own message (fromMe=true)");
        return new Response(JSON.stringify({ ok: true, skipped: "from_me" }), { headers: jsonH });
      }

      // Detect audio messages
      const isAudio = body.data?.message?.audioMessage || body.data?.messageType === "audioMessage";
      const audioMediaUrl = body.data?.message?.audioMessage?.url || body.data?.mediaUrl || null;
      const audioMsgId = body.data?.key?.id || body.data?.messageId || null;
      log("📩 isAudio:", !!isAudio, "audioMediaUrl:", audioMediaUrl ? "yes" : "no", "audioMsgId:", audioMsgId);

      if (!phone || (!msg && !isAudio)) {
        log("⚠️ No phone or msg found, skipping");
        return new Response(JSON.stringify({ ok: true, skipped: "no_msg" }), { headers: jsonH });
      }

      log("🚀 CALLING handleAgent...");
      const t0 = Date.now();
      try {
        const result = await handleAgent(supabase, uazapiCompanyId, phone, msg || "[áudio]", {
          is_audio: !!isAudio,
          audio_media_url: audioMediaUrl,
          audio_message_id: audioMsgId,
        });
        const elapsed = Date.now() - t0;
        log("✅ handleAgent completed in", elapsed, "ms, result:", JSON.stringify(result).substring(0, 300));

        await supabase.from("whatsapp_agent_logs").insert({
          company_id: uazapiCompanyId,
          conversation_id: result.conversation_id || null,
          action: "response_sent",
          details: { response_time_ms: elapsed, is_audio: !!isAudio },
        }).then(() => log("✅ Agent log inserted")).catch((e: any) => logErr("❌ Agent log insert error:", e));

        return new Response(JSON.stringify({ ok: true, ...result }), { headers: jsonH });
      } catch (agentErr: any) {
        logErr("❌ handleAgent THREW:", agentErr.message, agentErr.stack);
        return new Response(JSON.stringify({ error: agentErr.message }), { status: 500, headers: jsonH });
      }
    }

    // ─── Agent processing route (internal call) ───
    if (body.action === "agent-process") {
      log("🔵 agent-process route, is_audio:", body.is_audio, "button_response:", body.button_response_id || "none");
      
      // If this is a button/list response, enrich the message with context
      let agentMessage = body.message;
      if (body.button_response_id) {
        agentMessage = `[BOTÃO CLICADO: id="${body.button_response_id}" texto="${body.button_response_text || body.message}"] ${body.message}`;
        log("🔘 Enriched message with button context:", agentMessage);
      }
      
      const result = await handleAgent(supabase, body.company_id, body.phone, agentMessage, {
        is_audio: body.is_audio || false,
        audio_media_url: body.audio_media_url || null,
        audio_media_key: body.audio_media_key || null,
        audio_message_id: body.audio_message_id || null,
        audio_wa_msg_id: body.audio_wa_msg_id || null,
        audio_chat_id: body.audio_chat_id || null,
      });
      return new Response(JSON.stringify(result), { headers: jsonH, status: result.error ? 500 : 200 });
    }

    // ─── Original send-whatsapp logic ───
    log("🔵 Standard send-whatsapp route");
    const { company_id, type, appointment_id, phone } = body as SendRequest;

    if (!company_id) return new Response(JSON.stringify({ error: "company_id is required" }), { status: 400, headers: jsonH });

    const { data: settings, error: settingsErr } = await supabase.from("whatsapp_settings").select("*").eq("company_id", company_id).single();
    if (settingsErr || !settings) return new Response(JSON.stringify({ error: "WhatsApp settings not found" }), { status: 404, headers: jsonH });
    if (!settings.active) return new Response(JSON.stringify({ error: "WhatsApp integration is disabled" }), { status: 400, headers: jsonH });
    if (!settings.base_url || !settings.instance_id || !settings.token) return new Response(JSON.stringify({ error: "Incomplete UAZAPI credentials" }), { status: 400, headers: jsonH });

    if (type === "test") {
      if (!phone) return new Response(JSON.stringify({ error: "phone is required for test" }), { status: 400, headers: jsonH });
      const result = await sendUazapiMessage(settings, phone, "✅ Teste de conexão UAZAPI realizado com sucesso!");
      return new Response(JSON.stringify({ success: true, result }), { headers: jsonH });
    }

    if (!appointment_id) return new Response(JSON.stringify({ error: "appointment_id is required" }), { status: 400, headers: jsonH });

    const { data: appointment, error: apptErr } = await supabase.from("appointments").select("*, services(name), companies:company_id(name, address)").eq("id", appointment_id).single();
    if (apptErr || !appointment) return new Response(JSON.stringify({ error: "Appointment not found" }), { status: 404, headers: jsonH });

    const { data: templateRow } = await supabase.from("message_templates").select("template").eq("company_id", company_id).eq("type", type).eq("active", true).single();
    if (!templateRow) return new Response(JSON.stringify({ error: `No active template for type: ${type}` }), { status: 404, headers: jsonH });

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

    try { responsePayload = await sendUazapiMessage(settings, targetPhone, message); }
    catch (e) { status = "error"; error = e instanceof Error ? e.message : String(e); }

    await supabase.from("whatsapp_logs").insert({ company_id, appointment_id, phone: targetPhone, type, status, error, payload: responsePayload ? { response: responsePayload, message } : { message, error } });

    return new Response(JSON.stringify({ success: status === "sent", status, error }), { headers: jsonH });
  } catch (e: any) {
    logErr("❌ TOP-LEVEL ERROR:", e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500, headers: jsonH });
  }
});

// ─── UAZAPI send ───
async function sendUazapiMessage(settings: { base_url: string; instance_id: string; token: string }, phone: string, message: string): Promise<any> {
  const url = settings.base_url.replace(/\/$/, "") + "/send/text";
  log("📤 SENDING via UAZAPI:", url, "phone:", phone, "len:", message.length);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", token: settings.token }, body: JSON.stringify({ number: phone, text: message }) });
  const text = await res.text();
  log("📤 UAZAPI response:", res.status, text.substring(0, 300));
  if (!res.ok) throw new Error(`UAZAPI error ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ─── Send "composing" presence to simulate typing ───
async function sendTypingPresence(settings: { base_url: string; token: string }, phone: string): Promise<void> {
  try {
    const url = settings.base_url.replace(/\/$/, "") + "/send/presence";
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: settings.token },
      body: JSON.stringify({ phone, presence: "composing" }),
    });
  } catch {
    // Non-fatal: ignore typing indicator errors
  }
}

// ─── Split long reply into human-like message chunks ───
function splitIntoHumanMessages(text: string): string[] {
  // First split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  
  const chunks: string[] = [];
  for (const para of paragraphs) {
    // If paragraph is short enough, keep as single message
    if (para.length <= 200) {
      chunks.push(para);
      continue;
    }
    // Split long paragraphs by single newlines
    const lines = para.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      // Group every 2-3 lines together
      let group = "";
      for (const line of lines) {
        if (group && (group + "\n" + line).length > 200) {
          chunks.push(group);
          group = line;
        } else {
          group = group ? group + "\n" + line : line;
        }
      }
      if (group) chunks.push(group);
    } else {
      // Single long line - split by sentences
      const sentences = para.match(/[^.!?]+[.!?]+\s*/g) || [para];
      let group = "";
      for (const s of sentences) {
        if (group && (group + s).length > 200) {
          chunks.push(group.trim());
          group = s;
        } else {
          group += s;
        }
      }
      if (group.trim()) chunks.push(group.trim());
    }
  }
  
  // If nothing was split, return original as single message
  return chunks.length > 0 ? chunks : [text];
}

// ─── Calculate realistic typing delay based on message length ───
function typingDelay(text: string): number {
  // Average reading speed ~40 chars/sec for typing simulation
  // Min 1.5s, max 4s
  const base = Math.max(1500, Math.min(4000, text.length * 50));
  // Add some randomness (±300ms)
  return base + Math.floor(Math.random() * 600) - 300;
}

// ─── Send reply in humanized chunks with typing indicators ───
async function sendHumanizedReply(
  settings: { base_url: string; instance_id: string; token: string },
  phone: string,
  fullReply: string
): Promise<void> {
  const chunks = splitIntoHumanMessages(fullReply);
  log("🗣️ Humanized send:", chunks.length, "chunks for reply of", fullReply.length, "chars");
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Send typing indicator before each message (except first which is immediate)
    if (i > 0) {
      await sendTypingPresence(settings, phone);
      const delay = typingDelay(chunk);
      log("🗣️ Typing delay:", delay, "ms for chunk", i + 1);
      await new Promise(r => setTimeout(r, delay));
    } else {
      // Small initial delay to seem natural
      await sendTypingPresence(settings, phone);
      await new Promise(r => setTimeout(r, 800 + Math.floor(Math.random() * 500)));
    }
    
    await sendUazapiMessage(settings, phone, chunk);
    log("🗣️ Chunk", i + 1, "/", chunks.length, "sent");
  }
}

function formatDate(dateStr: string): string { const [y, m, d] = dateStr.split("-"); return `${d}/${m}/${y}`; }

// ─── WhatsApp Media Decryption ───
async function decryptWhatsAppMedia(encryptedData: Uint8Array, mediaKeyB64: string, mediaType: string = "audio"): Promise<Uint8Array> {
  log("🔐 Decrypting WhatsApp media, encrypted size:", encryptedData.length, "type:", mediaType);
  
  // Info strings for HKDF by media type
  const infoStrings: Record<string, string> = {
    audio: "WhatsApp Audio Keys",
    ptt: "WhatsApp Audio Keys",
    image: "WhatsApp Image Keys",
    video: "WhatsApp Video Keys",
    document: "WhatsApp Document Keys",
  };
  const info = new TextEncoder().encode(infoStrings[mediaType] || infoStrings.audio);
  
  // Decode the base64 mediaKey (32 bytes)
  const mediaKeyBytes = Uint8Array.from(atob(mediaKeyB64), c => c.charCodeAt(0));
  log("🔐 mediaKey decoded:", mediaKeyBytes.length, "bytes");
  
  // Import mediaKey for HKDF
  const hkdfKey = await crypto.subtle.importKey("raw", mediaKeyBytes, "HKDF", false, ["deriveBits"]);
  
  // Derive 112 bytes using HKDF-SHA256
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
    hkdfKey,
    112 * 8 // bits
  );
  const derived = new Uint8Array(derivedBits);
  
  // Split derived key material
  const iv = derived.slice(0, 16);        // 16 bytes IV
  const cipherKey = derived.slice(16, 48); // 32 bytes AES-256 key
  // macKey = derived.slice(48, 80);       // 32 bytes MAC key (not needed for decryption)
  // refKey = derived.slice(80, 112);      // 32 bytes ref key (unused)
  
  // The encrypted file has 10 bytes of MAC at the end
  const encFile = encryptedData.slice(0, encryptedData.length - 10);
  
  // Import AES key and decrypt
  const aesKey = await crypto.subtle.importKey("raw", cipherKey, { name: "AES-CBC" }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, encFile);
  
  log("🔐 Decrypted successfully:", decrypted.byteLength, "bytes");
  return new Uint8Array(decrypted);
}

// ─── Audio Transcription via ElevenLabs STT ───
async function transcribeAudio(audioUrl: string, wsSettings: any, mediaKey?: string | null): Promise<string> {
  log("🎵 Transcribing audio from:", audioUrl.substring(0, 100));
  
  // Download audio from URL
  let audioData: Uint8Array;
  try {
    const headers: Record<string, string> = {};
    // If URL is from UAZAPI, include token
    if (wsSettings?.token && audioUrl.includes(wsSettings.base_url?.replace("https://", "").replace("http://", ""))) {
      headers.token = wsSettings.token;
    }
    const audioRes = await fetch(audioUrl, { headers });
    if (!audioRes.ok) throw new Error(`Download failed: ${audioRes.status}`);
    audioData = new Uint8Array(await audioRes.arrayBuffer());
    log("🎵 Audio downloaded:", audioData.length, "bytes");
  } catch (e: any) {
    logErr("🎵 Audio download error:", e.message);
    throw new Error("audio_download_failed: " + e.message);
  }

  // If we have a mediaKey, the file is encrypted WhatsApp media - decrypt it
  if (mediaKey) {
    try {
      audioData = await decryptWhatsAppMedia(audioData, mediaKey, "audio");
      log("🎵 Audio decrypted successfully:", audioData.length, "bytes");
    } catch (e: any) {
      logErr("🎵 WhatsApp media decryption failed:", e.message);
      // Continue with raw data as fallback (maybe it's not encrypted)
    }
  }

  // Transcribe using ElevenLabs STT
  const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY_CUSTOM") || Deno.env.get("ELEVENLABS_API_KEY");
  if (elevenLabsKey) {
    try {
      const formData = new FormData();
      formData.append("file", new Blob([audioData], { type: "audio/ogg" }), "audio.ogg");
      formData.append("model_id", "scribe_v2");
      formData.append("language_code", "por");

      const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": elevenLabsKey },
        body: formData,
      });

      if (sttRes.ok) {
        const result = await sttRes.json();
        log("🎵 ElevenLabs STT result:", result.text?.substring(0, 200));
        if (result.text) return result.text;
      } else {
        const errText = await sttRes.text();
        logErr("🎵 ElevenLabs STT error:", sttRes.status, errText.substring(0, 200));
      }
    } catch (e: any) {
      logErr("🎵 ElevenLabs STT exception:", e.message);
    }
  }

  // Fallback: OpenAI Whisper
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    try {
      const formData = new FormData();
      formData.append("file", new Blob([audioData], { type: "audio/ogg" }), "audio.ogg");
      formData.append("model", "whisper-1");
      formData.append("language", "pt");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
      });

      if (whisperRes.ok) {
        const result = await whisperRes.json();
        log("🎵 Whisper result:", result.text?.substring(0, 200));
        if (result.text) return result.text;
      } else {
        const errText = await whisperRes.text();
        logErr("🎵 Whisper error:", whisperRes.status, errText.substring(0, 200));
      }
    } catch (e: any) {
      logErr("🎵 Whisper exception:", e.message);
    }
  }

  throw new Error("no_stt_available");
}

// ─── Text-to-Speech via ElevenLabs ───
async function textToSpeech(text: string, voiceId: string): Promise<Uint8Array | null> {
  const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY_CUSTOM") || Deno.env.get("ELEVENLABS_API_KEY");
  if (!elevenLabsKey) return null;

  try {
    log("🔊 TTS generating audio for:", text.substring(0, 80));
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
      }),
    });

    if (ttsRes.ok) {
      const audioData = new Uint8Array(await ttsRes.arrayBuffer());
      log("🔊 TTS generated:", audioData.length, "bytes");
      return audioData;
    } else {
      const errText = await ttsRes.text();
      logErr("🔊 TTS error:", ttsRes.status, errText.substring(0, 200));
    }
  } catch (e: any) {
    logErr("🔊 TTS exception:", e.message);
  }
  return null;
}

// ─── Send interactive menu (buttons/list) via UAZAPI /send/menu ───
async function sendMenuViaUazapi(
  wsSettings: { base_url: string; token: string },
  phone: string,
  options: {
    type: "button" | "list" | "poll";
    text: string;
    footerText?: string;
    choices: string[];
    title?: string; // for list type
    imageButton?: string; // URL for button image
  }
): Promise<any> {
  const baseUrl = wsSettings.base_url.replace(/\/$/, "");
  const url = baseUrl + "/send/menu";
  const body: any = {
    number: phone,
    type: options.type,
    text: options.text,
    choices: options.choices,
  };
  if (options.footerText) body.footerText = options.footerText;
  if (options.title) body.title = options.title;
  if (options.imageButton) body.imageButton = options.imageButton;

  log("🔘 Sending menu via UAZAPI:", url, "type:", options.type, "choices:", options.choices.length);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: wsSettings.token },
    body: JSON.stringify(body),
  });
  const resText = await res.text();
  log("🔘 UAZAPI /send/menu result:", res.status, resText.substring(0, 300));
  if (!res.ok) throw new Error(`UAZAPI menu error ${res.status}: ${resText.substring(0, 200)}`);
  try { return JSON.parse(resText); } catch { return { raw: resText }; }
}

// ─── Send audio via UAZAPI ───
async function sendAudioViaUazapi(wsSettings: any, phone: string, audioData: Uint8Array): Promise<void> {
  // Upload to Supabase storage first, then send URL
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const fileName = `tts/${Date.now()}.mp3`;
  
  const { error: upErr } = await sb.storage.from("agent-files").upload(fileName, audioData, { contentType: "audio/mpeg" });
  if (upErr) {
    logErr("🔊 Upload TTS error:", upErr.message);
    return;
  }
  
  const { data: urlData } = sb.storage.from("agent-files").getPublicUrl(fileName);
  const audioUrl = urlData.publicUrl;
  log("🔊 TTS uploaded to:", audioUrl);

  // UAZAPI v2 uses unified /send/media endpoint with type field
  const baseUrl = wsSettings.base_url.replace(/\/$/, "");
  const sendUrl = baseUrl + "/send/media";
  const sendBody = { number: phone, type: "ptt", file: audioUrl, delay: 1 };
  
  log("🔊 Sending audio via /send/media (type=ptt):", sendUrl);
  const res = await fetch(sendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: wsSettings.token },
    body: JSON.stringify(sendBody),
  });
  const resText = await res.text();
  log("🔊 UAZAPI /send/media result:", res.status, resText.substring(0, 300));
  
  if (res.status !== 200 && res.status !== 201) {
    // Fallback: try type "audio" instead of "ptt"
    log("🔊 ⚠️ PTT failed, trying type=audio...");
    const res2 = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: wsSettings.token },
      body: JSON.stringify({ number: phone, type: "audio", file: audioUrl, delay: 1 }),
    });
    const resText2 = await res2.text();
    log("🔊 UAZAPI /send/media (type=audio) result:", res2.status, resText2.substring(0, 300));
  }
}

// ─── Download audio from UAZAPI (try multiple endpoints) ───
async function downloadAudioFromUazapi(wsSettings: any, messageId: string, waMessageId?: string, chatId?: string): Promise<string | null> {
  if (!wsSettings?.base_url || !wsSettings?.token) return null;
  
  const baseUrl = wsSettings.base_url.replace(/\/$/, "");
  const token = wsSettings.token;
  const headers = { token };
  const headersJson = { "Content-Type": "application/json", token };

  // Helper: process response
  async function processRes(res: Response, label: string): Promise<string | null> {
    if (!res.ok) {
      const errText = await res.text();
      logErr(`🎵 ${label} error:`, res.status, errText.substring(0, 200));
      return null;
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      const url = data.url || data.link || data.mediaUrl || data.data?.url || data.data?.link || data.data?.mediaUrl;
      if (url) { log(`🎵 ${label} got URL:`, String(url).substring(0, 100)); return url; }
      if (data.base64) { return await uploadBase64ToStorage(data.base64); }
      if (data.data?.base64) { return await uploadBase64ToStorage(data.data.base64); }
      log(`🎵 ${label} JSON response but no url/base64. Keys:`, Object.keys(data).join(","));
    } else {
      const audioData = new Uint8Array(await res.arrayBuffer());
      if (audioData.length > 100) {
        log(`🎵 ${label} got binary:`, audioData.length, "bytes");
        return await uploadBinaryToStorage(audioData);
      }
    }
    return null;
  }

  // Strategy 1: GET /chat/downloadMediaMessage?messageid={id}
  if (messageId) {
    try {
      const url = `${baseUrl}/chat/downloadMediaMessage?messageid=${messageId}`;
      log("🎵 Try GET downloadMediaMessage (query):", url);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET downloadMediaMessage?messageid");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET downloadMediaMessage query exception:", e.message); }
  }

  // Strategy 2: GET /chat/downloadMediaMessage/{id}
  if (messageId) {
    try {
      const url = `${baseUrl}/chat/downloadMediaMessage/${messageId}`;
      log("🎵 Try GET downloadMediaMessage/{id}:", url);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET downloadMediaMessage/{id}");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET downloadMediaMessage/{id} exception:", e.message); }
  }

  // Strategy 3: GET /chat/getMediaLink?messageid={id}
  if (messageId) {
    try {
      const url = `${baseUrl}/chat/getMediaLink?messageid=${messageId}`;
      log("🎵 Try GET getMediaLink:", url);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET getMediaLink");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET getMediaLink exception:", e.message); }
  }

  // Strategy 4: GET /chat/getLink?messageid={id}
  if (messageId) {
    try {
      const url = `${baseUrl}/chat/getLink?messageid=${messageId}`;
      log("🎵 Try GET getLink:", url);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET getLink");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET getLink exception:", e.message); }
  }

  // Strategy 5: GET /message/downloadMedia?messageid={id}
  if (messageId) {
    try {
      const url = `${baseUrl}/message/downloadMedia?messageid=${messageId}`;
      log("🎵 Try GET message/downloadMedia:", url);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET message/downloadMedia");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET message/downloadMedia exception:", e.message); }
  }

  // Strategy 6: POST /chat/downloadMediaMessage with chatid + messageid
  if (messageId && chatId) {
    try {
      const url = `${baseUrl}/chat/downloadMediaMessage`;
      log("🎵 Try POST downloadMediaMessage with chatid:", chatId);
      const res = await fetch(url, {
        method: "POST",
        headers: headersJson,
        body: JSON.stringify({ messageid: messageId, chatid: chatId }),
      });
      const result = await processRes(res, "POST downloadMediaMessage+chatid");
      if (result) return result;
    } catch (e: any) { logErr("🎵 POST downloadMediaMessage+chatid exception:", e.message); }
  }

  // Strategy 7: Try with WhatsApp message ID
  if (waMessageId && waMessageId !== messageId) {
    try {
      const url = `${baseUrl}/chat/downloadMediaMessage?messageid=${encodeURIComponent(waMessageId)}`;
      log("🎵 Try GET downloadMediaMessage with wa_id:", waMessageId);
      const res = await fetch(url, { headers });
      const result = await processRes(res, "GET downloadMediaMessage wa_id");
      if (result) return result;
    } catch (e: any) { logErr("🎵 GET downloadMediaMessage wa_id exception:", e.message); }
  }

  log("🎵 All download strategies failed for messageid:", messageId, "wa_id:", waMessageId, "chatid:", chatId);
  return null;
}

async function uploadBase64ToStorage(base64Data: string): Promise<string> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const path = `audio-incoming/${Date.now()}.ogg`;
  await sb.storage.from("agent-files").upload(path, binaryData, { contentType: "audio/ogg" });
  const { data: urlData } = sb.storage.from("agent-files").getPublicUrl(path);
  log("🎵 Uploaded base64 audio to storage:", urlData.publicUrl);
  return urlData.publicUrl;
}

async function uploadBinaryToStorage(audioData: Uint8Array): Promise<string> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const path = `audio-incoming/${Date.now()}.ogg`;
  await sb.storage.from("agent-files").upload(path, audioData, { contentType: "audio/ogg" });
  const { data: urlData } = sb.storage.from("agent-files").getPublicUrl(path);
  log("🎵 Uploaded binary audio to storage:", urlData.publicUrl);
  return urlData.publicUrl;
}

// ─── AI Agent Logic ───
const DN = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

interface AudioParams {
  is_audio: boolean;
  audio_media_url: string | null;
  audio_media_key: string | null;
  audio_message_id: string | null;
  audio_wa_msg_id?: string | null;
  audio_chat_id?: string | null;
}

async function handleAgent(sb: any, cid: string, phone: string, msg: string, audioParams: AudioParams = { is_audio: false, audio_media_url: null, audio_media_key: null, audio_message_id: null }): Promise<any> {
  log("🤖 handleAgent START cid:", cid, "phone:", phone, "msg:", msg.substring(0, 100), "is_audio:", audioParams.is_audio);

  if (!cid || !phone || !msg) {
    log("🤖 ❌ Missing fields");
    return { error: "missing fields" };
  }

  // Check agent settings
  log("🤖 Fetching agent settings...");
  const { data: ag, error: agErr } = await sb.from("whatsapp_agent_settings").select("*").eq("company_id", cid).single();
  log("🤖 Agent settings:", ag ? `enabled=${ag.enabled}` : "NOT FOUND", "error:", agErr?.message);
  if (!ag?.enabled) {
    log("🤖 Agent is DISABLED, skipping");
    return { ok: true, skipped: "agent_disabled" };
  }

  // Get/create conversation
  log("🤖 Looking for active conversation...");
  let { data: conv, error: convErr } = await sb.from("whatsapp_conversations").select("*").eq("company_id", cid).eq("phone", phone).eq("status", "active").order("created_at", { ascending: false }).limit(1).single();
  log("🤖 Existing conv:", conv?.id || "NONE", "error:", convErr?.message);

  if (!conv) {
    log("🤖 Creating new conversation...");
    const { data: nc, error: ncErr } = await sb.from("whatsapp_conversations").insert({ company_id: cid, phone, status: "active" }).select().single();
    conv = nc;
    log("🤖 New conv:", nc?.id || "FAILED", "error:", ncErr?.message);
  }
  if (!conv) {
    logErr("🤖 ❌ Conv creation failed!");
    return { error: "conv_fail" };
  }

  if (conv.handoff_requested) {
    log("🤖 Handoff active, skipping");
    return { ok: true, skipped: "handoff" };
  }

  // ── Deduplication: check if same message was already saved in last 15s ──
  const fifteenSecsAgo = new Date(Date.now() - 15000).toISOString();
  const { data: recentDups } = await sb.from("whatsapp_messages")
    .select("id")
    .eq("conversation_id", conv.id)
    .eq("direction", "incoming")
    .eq("content", msg)
    .gte("created_at", fifteenSecsAgo)
    .limit(1);
  
  if (recentDups && recentDups.length > 0) {
    log("🤖 ⚠️ DUPLICATE detected, skipping. Existing msg:", recentDups[0].id);
    return { ok: true, skipped: "duplicate", conversation_id: conv.id };
  }

  // ── Audio transcription: convert audio to text ──
  let actualMsg = msg;
  let isAudioMsg = audioParams.is_audio;
  
  if (isAudioMsg) {
    log("🎵 Audio message detected, attempting transcription...");
    
    // Fetch WS settings to download media from UAZAPI
    const { data: wsForAudio } = await sb.from("whatsapp_settings").select("base_url, instance_id, token, active").eq("company_id", cid).single();
    
    let audioUrl = audioParams.audio_media_url;
    
    // If no direct URL, try downloading from UAZAPI
    if (!audioUrl && audioParams.audio_message_id && wsForAudio) {
      audioUrl = await downloadAudioFromUazapi(wsForAudio, audioParams.audio_message_id, audioParams.audio_wa_msg_id || undefined, audioParams.audio_chat_id || undefined);
    }
    
    if (audioUrl) {
      try {
        actualMsg = await transcribeAudio(audioUrl, wsForAudio, audioParams.audio_media_key);
        log("🎵 Transcribed audio:", actualMsg.substring(0, 150));
      } catch (e: any) {
        logErr("🎵 Transcription failed:", e.message);
        actualMsg = "[O cliente enviou um áudio que não pôde ser transcrito]";
      }
    } else {
      log("🎵 No audio URL available, cannot transcribe");
      actualMsg = "[O cliente enviou um áudio mas não foi possível obter o arquivo]";
    }
  }

  // Save incoming message
  log("🤖 Saving incoming message...");
  const { error: msgErr } = await sb.from("whatsapp_messages").insert({ 
    conversation_id: conv.id, company_id: cid, direction: "incoming", 
    message_type: isAudioMsg ? "audio" : "text", 
    content: actualMsg,
    metadata: isAudioMsg ? { original_type: "audio", transcribed: actualMsg !== msg } : {}
  });
  log("🤖 Message saved:", msgErr ? `ERROR: ${msgErr.message}` : "OK");

  await sb.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

  // Load context
  log("🤖 Loading context...");
  const t1 = Date.now();
  const ctx = await loadCtx(sb, cid, phone, conv.id);
  log("🤖 Context loaded in", Date.now() - t1, "ms. msgs:", ctx.msgs.length, "appts:", ctx.appts.length, "svcs:", ctx.svcs.length, "kb:", ctx.kb.length);

  // Call AI
  log("🤖 Calling AI...");
  const t2 = Date.now();
  try {
    let reply = await callAI(sb, cid, conv, ctx, actualMsg);
    log("🤖 AI reply in", Date.now() - t2, "ms:", reply.substring(0, 150));

    // Auto-send services as interactive menu when scheduling intent is detected
    // and the AI didn't already send a menu (no tool calls for buttons/list)
    if (reply !== "__MENU_SENT__" && (ctx.svcs || []).length > 0) {
      const schedulingKeywords = /\b(agendar|marcar|reservar|horário|horario|appointment|schedule|quero.*hora|quero.*serviço|quero.*servico|gostaria.*agendar|preciso.*agendar)\b/i;
      const isSchedulingIntent = schedulingKeywords.test(actualMsg);
      
      if (isSchedulingIntent) {
        log("🔘 Scheduling intent detected, auto-sending services menu...");
        const { data: ws } = await sb.from("whatsapp_settings").select("base_url, instance_id, token, active").eq("company_id", cid).single();
        if (ws?.active && ws?.base_url && ws?.token) {
          try {
            const svcs = ctx.svcs;
            // First send the AI text reply, then follow up with the services menu
            // Send the text reply first
            const cleanPhone = phone.replace(/\D/g, "");
            await sendHumanizedReply(
              { base_url: ws.base_url, instance_id: ws.instance_id || "", token: ws.token },
              cleanPhone, reply
            );
            log("🔘 Text reply sent before services menu");

            // Now send the services menu
            const headerText = "Escolha o serviço que deseja agendar: 👇";
            if (svcs.length <= 3) {
              const choices = svcs.map((s: any) => `${s.name}|svc_${s.id.substring(0, 8)}`);
              await sendMenuViaUazapi(
                { base_url: ws.base_url, token: ws.token },
                cleanPhone,
                { type: "button", text: headerText, choices, footerText: svcs.some((s: any) => s.price) ? svcs.map((s: any) => `${s.name}: R$${s.price || '?'}`).join(" | ") : undefined }
              );
              log("🔘 ✅ Services sent as buttons:", svcs.length);
            } else {
              const choices = svcs.map((s: any) => `${s.name}|${s.duration}min${s.price ? ' - R$' + s.price : ''}`);
              await sendMenuViaUazapi(
                { base_url: ws.base_url, token: ws.token },
                cleanPhone,
                { type: "list", text: headerText, choices, title: "Ver serviços", footerText: `${svcs.length} serviços disponíveis` }
              );
              log("🔘 ✅ Services sent as list:", svcs.length);
            }
            // Mark as menu sent — text was already sent above, skip double send
            reply = "__MENU_SENT__";
          } catch (e: any) {
            logErr("🔘 ❌ Auto services menu failed:", e.message);
            // Don't change reply — let it send as normal text
          }
        }
      }
    }

    // Check if reply is a menu marker (buttons/list already sent via /send/menu)
    const menuAlreadySent = reply === "__MENU_SENT__";
    const displayReply = menuAlreadySent ? "[menu interativo enviado]" : reply;

    // Save outgoing message
    const { error: outErr } = await sb.from("whatsapp_messages").insert({ conversation_id: conv.id, company_id: cid, direction: "outgoing", message_type: menuAlreadySent ? "interactive" : "text", content: displayReply });
    log("🤖 Outgoing msg saved:", outErr ? `ERROR: ${outErr.message}` : "OK");

    // Send via UAZAPI (skip if menu was already sent)
    if (menuAlreadySent) {
      log("🤖 ✅ Menu already sent via /send/menu, skipping text send");
    } else {
      log("🤖 Fetching WhatsApp settings to send reply...");
      const { data: ws, error: wsErr } = await sb.from("whatsapp_settings").select("base_url, instance_id, token, active").eq("company_id", cid).single();
      log("🤖 WS settings:", ws ? `active=${ws.active} base_url=${ws.base_url}` : "NOT FOUND", "error:", wsErr?.message);

      if (ws?.active && ws?.base_url && ws?.token) {
        const cleanPhone = phone.replace(/\D/g, "");
        
        // Check if we should respond with audio (when incoming was audio and setting is enabled)
        if (isAudioMsg && ag?.respond_audio_with_audio && ag?.elevenlabs_voice_id) {
          log("🔊 Responding with audio (respond_audio_with_audio=true)");
          try {
            const audioData = await textToSpeech(reply, ag.elevenlabs_voice_id);
            if (audioData) {
              await sendAudioViaUazapi(ws, cleanPhone, audioData);
              log("🔊 ✅ Audio response sent!");
            } else {
              log("🔊 TTS returned null, falling back to text");
              await sendHumanizedReply(
                { base_url: ws.base_url, instance_id: ws.instance_id || "", token: ws.token },
                cleanPhone, reply
              );
            }
          } catch (e: any) {
            logErr("🔊 Audio response failed, falling back to text:", e.message);
            await sendHumanizedReply(
              { base_url: ws.base_url, instance_id: ws.instance_id || "", token: ws.token },
              cleanPhone, reply
            );
          }
        } else {
          // Standard text reply
          try {
            log("🤖 Sending humanized reply via UAZAPI...");
            await sendHumanizedReply(
              { base_url: ws.base_url, instance_id: ws.instance_id || "", token: ws.token },
              cleanPhone, reply
            );
            log("🤖 ✅ Humanized reply sent successfully!");
          } catch (e: any) {
            logErr("🤖 ❌ Send error:", e.message);
          }
        }
      } else {
        log("🤖 ⚠️ Cannot send: WS inactive or missing credentials");
      }
    }

    return { ok: true, response: displayReply, conversation_id: conv.id, is_audio: isAudioMsg };
  } catch (aiErr: any) {
    logErr("🤖 ❌ AI call FAILED:", aiErr.message, aiErr.stack);
    return { error: aiErr.message, conversation_id: conv.id };
  }
}

async function loadCtx(sb: any, cid: string, ph: string, convId: string) {
  const cp = ph.replace(/\D/g, "");
  const [m, a, c, s, h, k, cs, as_, st, ss, af] = await Promise.all([
    sb.from("whatsapp_messages").select("direction, content, created_at").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(20),
    sb.from("appointments").select("id, client_name, appointment_date, start_time, end_time, status, services(name), staff(name)").eq("company_id", cid).or("client_phone.eq." + cp + ",client_phone.eq.+" + cp).in("status", ["pending", "confirmed"]).order("appointment_date", { ascending: true }).limit(10),
    sb.from("companies").select("name, address, phone").eq("id", cid).single(),
    sb.from("services").select("id, name, duration, price, description").eq("company_id", cid).eq("active", true),
    sb.from("business_hours").select("day_of_week, open_time, close_time, is_open").eq("company_id", cid),
    sb.from("whatsapp_knowledge_base").select("category, title, content").eq("company_id", cid).eq("active", true),
    sb.from("company_settings").select("slot_interval, max_capacity_per_slot, min_advance_hours").eq("company_id", cid).single(),
    sb.from("whatsapp_agent_settings").select("custom_prompt, timezone, can_share_address, can_share_phone, can_share_business_hours, can_share_services, can_share_professionals, can_handle_anamnesis, can_send_files, can_send_images, can_send_audio, custom_business_info").eq("company_id", cid).single(),
    sb.from("staff").select("id, name").eq("company_id", cid).eq("active", true),
    sb.from("staff_services").select("staff_id, service_id").in("staff_id", (await sb.from("staff").select("id").eq("company_id", cid).eq("active", true)).data?.map((x: any) => x.id) || []),
    sb.from("whatsapp_agent_files").select("file_name, file_url, file_type, description").eq("company_id", cid).eq("active", true),
  ]);
  const agentCaps = as_.data || {};
  return {
    msgs: (m.data || []).reverse(), appts: a.data || [], co: c.data || {}, svcs: s.data || [], hrs: h.data || [],
    kb: k.data || [], cs: { ...(cs.data || {}), custom_prompt: agentCaps.custom_prompt, timezone: agentCaps.timezone || "America/Sao_Paulo" },
    staff: st.data || [], staffServices: ss.data || [], agentFiles: af.data || [],
    caps: {
      can_share_address: agentCaps.can_share_address ?? true,
      can_share_phone: agentCaps.can_share_phone ?? true,
      can_share_business_hours: agentCaps.can_share_business_hours ?? true,
      can_share_services: agentCaps.can_share_services ?? true,
      can_share_professionals: agentCaps.can_share_professionals ?? true,
      can_handle_anamnesis: agentCaps.can_handle_anamnesis ?? false,
      can_send_files: agentCaps.can_send_files ?? false,
      can_send_images: agentCaps.can_send_images ?? false,
      can_send_audio: agentCaps.can_send_audio ?? false,
      custom_business_info: agentCaps.custom_business_info || null,
    },
  };
}

async function callAI(sb: any, cid: string, conv: any, ctx: any, userMsg: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  log("🧠 callAI: LOVABLE_API_KEY exists:", !!key, "length:", key?.length);
  if (!key) throw new Error("LOVABLE_API_KEY missing");

  const hrs = (ctx.hrs || []).sort((a: any, b: any) => a.day_of_week - b.day_of_week).map((x: any) => DN[x.day_of_week] + ": " + (x.is_open ? (x.open_time || "").substring(0, 5) + "-" + (x.close_time || "").substring(0, 5) : "Fechado")).join("; ");
  const svcs = (ctx.svcs || []).map((x: any) => x.name + " (id:" + x.id + ") " + x.duration + "min R$" + (x.price || "?")).join("; ");
  const kbs = (ctx.kb || []).map((x: any) => x.title + ": " + x.content).join("; ");
  const appts = (ctx.appts || []).map((x: any, i: number) => (i + 1) + "." + (x.services?.name || "?") + " " + x.appointment_date + " " + (x.start_time || "").substring(0, 5) + " " + x.status + " (id:" + x.id + ")" + (x.staff?.name ? " prof:" + x.staff.name : "")).join("; ");

  // Build staff info with their services
  const staffInfo = (ctx.staff || []).map((s: any) => {
    const svcIds = (ctx.staffServices || []).filter((ss: any) => ss.staff_id === s.id).map((ss: any) => ss.service_id);
    const svcNames = (ctx.svcs || []).filter((sv: any) => svcIds.includes(sv.id)).map((sv: any) => sv.name);
    return s.name + " (id:" + s.id + ")" + (svcNames.length ? " - serviços: " + svcNames.join(", ") : " - todos os serviços");
  }).join("; ");

  const hasHistory = ctx.msgs && ctx.msgs.length > 0;
  const caps = ctx.caps || {};

  // Dynamic date/time using configured timezone
  const tz = ctx.cs?.timezone || "America/Sao_Paulo";
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(now);
  const timeStr = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const tzLabel = tz.replace(/_/g, " ").split("/").pop();

  // Build data section conditionally based on capabilities
  const dataParts: string[] = [];
  dataParts.push(ctx.co.name || "");
  if (caps.can_share_address && ctx.co.address) dataParts.push("End: " + ctx.co.address);
  if (caps.can_share_phone && ctx.co.phone) dataParts.push("Tel: " + ctx.co.phone);
  
  const capabilityRules: string[] = [];
  if (!caps.can_share_address) capabilityRules.push("- NÃO informe o endereço do estabelecimento em hipótese alguma");
  if (!caps.can_share_phone) capabilityRules.push("- NÃO informe o telefone do estabelecimento");
  if (!caps.can_share_business_hours) capabilityRules.push("- NÃO informe os horários de funcionamento. Se perguntarem, diga para entrar em contato diretamente");
  if (!caps.can_share_services) capabilityRules.push("- NÃO liste ou detalhe os serviços disponíveis. Oriente o cliente a consultar diretamente");
  if (!caps.can_share_professionals) capabilityRules.push("- NÃO mencione nomes de profissionais específicos");
  if (!caps.can_handle_anamnesis) capabilityRules.push("- NÃO conduza preenchimento de fichas de anamnese");

  // File sending rules
  const fileParts: string[] = [];
  if (caps.can_send_files || caps.can_send_images || caps.can_send_audio) {
    const allowedTypes: string[] = [];
    if (caps.can_send_files) allowedTypes.push("documentos/PDF");
    if (caps.can_send_images) allowedTypes.push("imagens/fotos");
    if (caps.can_send_audio) allowedTypes.push("áudios");
    
    const relevantFiles = (ctx.agentFiles || []).filter((f: any) => {
      if (f.file_type === "document" && caps.can_send_files) return true;
      if (f.file_type === "image" && caps.can_send_images) return true;
      if (f.file_type === "audio" && caps.can_send_audio) return true;
      return false;
    });

    if (relevantFiles.length > 0) {
      fileParts.push(`\nARQUIVOS DISPONÍVEIS PARA ENVIO (${allowedTypes.join(", ")}):`);
      fileParts.push("Quando for relevante, use a ferramenta send_file para enviar um arquivo ao cliente.");
      for (const f of relevantFiles) {
        fileParts.push(`- "${f.file_name}" (${f.file_type})${f.description ? ": " + f.description : ""} | url: ${f.file_url}`);
      }
    }
  }

  const sys = `Você é a atendente virtual de ${ctx.co.name || "nossa empresa"} no WhatsApp.

DATA E HORA ATUAL (use como referência oficial):
${dateStr}, ${timeStr} (fuso: ${tzLabel})

REGRAS ESSENCIAIS:
- Fale como pessoa real: informal, curta, acolhedora
- Máximo 2-3 frases por resposta
- Emojis com moderação (1-2 por mensagem)
- SEM listas, SEM formatação markdown, SEM negrito/itálico
- Separe assuntos com \\n\\n (enviados como mensagens separadas)
- NÃO repita o que o cliente já sabe ou que já foi dito na conversa
${capabilityRules.length > 0 ? "\nRESTRIÇÕES DE INFORMAÇÃO (OBEDEÇA RIGOROSAMENTE):\n" + capabilityRules.join("\n") : ""}

REGRA DE NOME DO CLIENTE (IMPORTANTE):
- Nome do cliente: ${conv.client_name || "DESCONHECIDO"}
- ${conv.client_name ? `Use o nome "${conv.client_name}" para personalizar as respostas de forma natural (ex: "Claro, ${conv.client_name}!")` : "O nome do cliente ainda NÃO É CONHECIDO. Na PRIMEIRA oportunidade natural, pergunte o nome do cliente de forma simpática (ex: 'Como posso te chamar?'). Use a ferramenta save_client_name assim que souber o nome."}
- Se o cliente informar o nome em qualquer mensagem, use save_client_name IMEDIATAMENTE para salvar

REGRA ANTI-REPETIÇÃO (CRÍTICO):
- ${hasHistory ? "Esta conversa JÁ ESTÁ EM ANDAMENTO. NÃO cumprimente novamente. NÃO diga 'oi', 'olá', 'tudo bem?'. Vá direto ao ponto respondendo a última mensagem." : "Esta é a PRIMEIRA mensagem do cliente. Cumprimente brevemente e pergunte como pode ajudar."}
- NUNCA repita saudações se já houve troca de mensagens
- Se o cliente já disse o nome, NÃO pergunte de novo
- Se já informou horários/serviços, NÃO repita — diga "como mencionei" ou vá direto ao próximo passo
- Analise o histórico antes de responder para não repetir informações

FLUXO DE AGENDAMENTO (IMPORTANTE):
- Quando o cliente quiser agendar, pergunte: 1) Qual serviço? 2) Qual data/horário de preferência?
- Use check_availability para verificar disponibilidade na data
- ${caps.can_share_professionals && staffInfo ? `Profissionais disponíveis: ${staffInfo}` : "Nenhum profissional cadastrado - agende sem profissional"}
- ${caps.can_share_professionals && (ctx.staff || []).length > 1 ? "Se houver mais de um profissional para o serviço, pergunte a preferência do cliente" : ""}
- ${(ctx.staff || []).length === 1 ? "Há apenas um profissional, agende diretamente com ele sem perguntar" : ""}
- Depois de confirmar serviço, data, horário${(ctx.staff || []).length > 1 && caps.can_share_professionals ? " e profissional" : ""}, use book_appointment para criar o agendamento
- Para remarcar, use check_availability no novo dia e depois reschedule_appointment
- Para cancelar, confirme com o cliente e use cancel_appointment
- O agendamento criado será automaticamente sincronizado com o Google Agenda

BOTÕES INTERATIVOS (OBRIGATÓRIO — SEMPRE USE QUANDO HOUVER ESCOLHA):
- REGRA: Toda vez que o cliente precisa ESCOLHER entre opções, você DEVE usar send_buttons ou send_list. NUNCA liste opções como texto simples.
- send_buttons: para 2-3 opções rápidas (serviços, sim/não, profissionais, horários)
- send_list: para 4+ opções (muitos horários, muitos serviços)
- Formato choices para buttons: ["Texto do botão|id_curto"] — ex: ["Corte de cabelo|corte", "Barba|barba"]
- Formato choices para list: ["Título|Descrição"] — ex: ["09:00|Horário disponível", "10:00|Horário disponível"]
- EXEMPLOS DE USO OBRIGATÓRIO:
  * Cliente quer agendar e há serviços → send_buttons com os serviços (ou send_list se >3)
  * Verificou disponibilidade e há horários → send_buttons com top 3 horários (ou send_list se >3)
  * Precisa confirmar algo → send_buttons ["Sim|sim", "Não|nao"]
  * Precisa escolher profissional → send_buttons com nomes
- IMPORTANTE: Ao usar send_buttons/send_list, inclua o texto explicativo no campo "text" do botão. NÃO retorne texto adicional no content — o texto dos botões já é a resposta.

RESPOSTAS DE BOTÕES (QUANDO O CLIENTE CLICA EM UM BOTÃO):
- Quando o cliente clica em um botão interativo, a mensagem chega no formato: [BOTÃO CLICADO: id="xxx" texto="yyy"] yyy
- O "id" corresponde ao id_curto que foi enviado no botão (ex: svc_corte, slot_0900, sim, nao)
- Use o ID para identificar a escolha do cliente e prosseguir no fluxo:
  * IDs começando com "svc_" = serviço selecionado → pergunte a data/horário e use check_availability
  * IDs começando com "slot_" = horário selecionado (formato slot_HHMM) → confirme e use book_appointment
  * ID "sim" ou "nao" = resposta de confirmação
- Trate a resposta de botão como se o cliente tivesse digitado a escolha — continue o fluxo normalmente
- NÃO pergunte novamente o que o cliente já escolheu pelo botão

DADOS (use só quando relevante, não despeje tudo de uma vez):
${dataParts.join(" | ")}
${caps.can_share_business_hours ? "Horários: " + hrs : ""}
${caps.can_share_services ? "Serviços: " + svcs : ""}
${caps.can_share_professionals ? "Profissionais: " + (staffInfo || "nenhum cadastrado") : ""}
${kbs ? "Info extra: " + kbs : ""}
${caps.custom_business_info ? "Info do estabelecimento: " + caps.custom_business_info : ""}
Agendamentos do cliente: ${appts || "nenhum"}
${fileParts.join("\n")}
${ctx.cs?.custom_prompt ? "\nINSTRUÇÕES PERSONALIZADAS DO ESTABELECIMENTO:\n" + ctx.cs.custom_prompt : ""}`;


  const messages: any[] = [{ role: "system", content: sys }];
  for (const m of ctx.msgs) messages.push({ role: m.direction === "incoming" ? "user" : "assistant", content: m.content || "" });
  messages.push({ role: "user", content: userMsg });

  log("🧠 AI request: model=google/gemini-2.5-flash, messages:", messages.length, "system_len:", sys.length);

  const tools: any[] = [
    { type: "function", function: { name: "confirm_appointment", description: "Confirma agendamento existente", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
    { type: "function", function: { name: "cancel_appointment", description: "Cancela agendamento existente", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
    { type: "function", function: { name: "check_availability", description: "Verifica horários disponíveis em uma data. Use TAMBÉM para verificar disponibilidade de um profissional específico passando staff_id.", parameters: { type: "object", properties: { date: { type: "string", description: "Data no formato YYYY-MM-DD" }, staff_id: { type: "string", description: "ID do profissional (opcional, filtra por profissional)" }, service_id: { type: "string", description: "ID do serviço (opcional, considera duração do serviço)" } }, required: ["date"] } } },
    { type: "function", function: { name: "book_appointment", description: "Cria um novo agendamento para o cliente", parameters: { type: "object", properties: { service_id: { type: "string", description: "ID do serviço" }, date: { type: "string", description: "Data YYYY-MM-DD" }, time: { type: "string", description: "Horário HH:MM" }, staff_id: { type: "string", description: "ID do profissional (opcional)" } }, required: ["service_id", "date", "time"] } } },
    { type: "function", function: { name: "reschedule_appointment", description: "Reagenda um agendamento existente para nova data/hora", parameters: { type: "object", properties: { appointment_id: { type: "string" }, new_date: { type: "string" }, new_time: { type: "string" } }, required: ["appointment_id", "new_date", "new_time"] } } },
    { type: "function", function: { name: "request_handoff", description: "Transfere para atendente humano", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "save_client_name", description: "Salva o nome do cliente quando ele se apresenta", parameters: { type: "object", properties: { name: { type: "string", description: "Nome do cliente" } }, required: ["name"] } } },
  ];

  // Add interactive menu tools (buttons and list)
  tools.push({
    type: "function",
    function: {
      name: "send_buttons",
      description: "Envia botões interativos ao cliente via WhatsApp. Útil para oferecer opções rápidas como escolha de serviço, confirmação sim/não, ou seleção de horário. Máximo 3 botões de resposta.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texto principal da mensagem acima dos botões" },
          choices: { type: "array", items: { type: "string" }, description: "Array de opções. Formato: 'Texto do botão|id_curto'. Ex: ['Corte de cabelo|svc_corte', 'Barba|svc_barba', 'Combo|svc_combo']" },
          footer_text: { type: "string", description: "Texto de rodapé opcional (aparece abaixo dos botões)" },
        },
        required: ["text", "choices"],
      },
    },
  });

  tools.push({
    type: "function",
    function: {
      name: "send_list",
      description: "Envia um menu lista expansível ao cliente. Útil quando há mais de 3 opções (serviços, horários disponíveis, etc). O cliente toca em 'Ver opções' para expandir.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texto principal da mensagem" },
          title: { type: "string", description: "Título do botão que abre a lista (ex: 'Ver serviços')" },
          choices: { type: "array", items: { type: "string" }, description: "Array de opções. Formato: 'Título da opção|descrição opcional'. Ex: ['Corte Masculino|30min - R$45', 'Barba|20min - R$30']" },
          footer_text: { type: "string", description: "Texto de rodapé opcional" },
        },
        required: ["text", "title", "choices"],
      },
    },
  });

  // Add send_file tool only if file sending is enabled and there are files
  if ((caps.can_send_files || caps.can_send_images || caps.can_send_audio) && (ctx.agentFiles || []).length > 0) {
    tools.push({
      type: "function",
      function: {
        name: "send_file",
        description: "Envia um arquivo (PDF, imagem ou áudio) ao cliente via WhatsApp. Use quando o contexto da conversa indicar que o arquivo seria útil.",
        parameters: { type: "object", properties: { file_url: { type: "string", description: "URL do arquivo a enviar" }, file_name: { type: "string", description: "Nome do arquivo para referência" }, file_type: { type: "string", description: "Tipo: document, image ou audio" } }, required: ["file_url", "file_name", "file_type"] },
      },
    });
  }

  log("🧠 Sending request to AI gateway...");
  const t0 = Date.now();
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools }),
  });
  log("🧠 AI response status:", r.status, "in", Date.now() - t0, "ms");

  if (!r.ok) {
    const t = await r.text();
    logErr("🧠 ❌ AI ERROR:", r.status, t.substring(0, 500));
    throw new Error("AI " + r.status + ": " + t.substring(0, 200));
  }

  const ai = await r.json();
  const ch = ai.choices?.[0];
  log("🧠 AI finish_reason:", ch?.finish_reason, "has_tool_calls:", !!ch?.message?.tool_calls, "content_len:", ch?.message?.content?.length);

  let txt = ch?.message?.content || "";

  if (ch?.message?.tool_calls) {
    log("🧠 Processing", ch.message.tool_calls.length, "tool calls...");
    for (const tc of ch.message.tool_calls) {
      let args: any = {}; try { args = JSON.parse(tc.function.arguments); } catch {}
      const fn = tc.function.name;
      log("🧠 Tool call:", fn, "args:", JSON.stringify(args));

      if (fn === "confirm_appointment") {
        const { error: upErr } = await sb.from("appointments").update({ status: "confirmed" }).eq("id", args.appointment_id).eq("company_id", cid);
        log("🧠 confirm result:", upErr ? `ERROR: ${upErr.message}` : "OK");
        txt = txt || "Agendamento confirmado! ✅";
      } else if (fn === "cancel_appointment") {
        const { error: upErr } = await sb.from("appointments").update({ status: "canceled" }).eq("id", args.appointment_id).eq("company_id", cid);
        log("🧠 cancel result:", upErr ? `ERROR: ${upErr.message}` : "OK");
        txt = txt || "Agendamento cancelado.";
      } else if (fn === "book_appointment") {
        // Find service to get duration
        const svc = (ctx.svcs || []).find((s: any) => s.id === args.service_id);
        const dur = svc?.duration || 30;
        const p = (args.time || "09:00").split(":").map(Number);
        const em = p[0] * 60 + p[1] + dur;
        const et = String(Math.floor(em / 60)).padStart(2, "0") + ":" + String(em % 60).padStart(2, "0");
        const clientName = conv.client_name || "Cliente WhatsApp";
        const clientPhone = conv.phone.replace(/\D/g, "");

        const insertData: any = {
          company_id: cid,
          service_id: args.service_id,
          appointment_date: args.date,
          start_time: args.time,
          end_time: et,
          client_name: clientName,
          client_phone: clientPhone,
          status: "confirmed",
        };
        if (args.staff_id) insertData.staff_id = args.staff_id;

        const { data: newAppt, error: bookErr } = await sb.from("appointments").insert(insertData).select("id").single();
        log("🧠 book_appointment result:", bookErr ? `ERROR: ${bookErr.message}` : `OK id:${newAppt?.id}`);
        
        if (bookErr) {
          txt = txt || "Desculpe, não consegui criar o agendamento. Tente novamente ou fale com um atendente.";
        } else {
          const staffName = args.staff_id ? (ctx.staff || []).find((s: any) => s.id === args.staff_id)?.name : null;
          txt = txt || `Agendamento criado! ✅ ${svc?.name || "Serviço"} em ${formatDate(args.date)} às ${args.time}${staffName ? " com " + staffName : ""}`;
        }
      } else if (fn === "reschedule_appointment") {
        const { data: ap } = await sb.from("appointments").select("services(duration)").eq("id", args.appointment_id).single();
        const dur = ap?.services?.duration || 30;
        const p = (args.new_time || "09:00").split(":").map(Number);
        const em = p[0] * 60 + p[1] + dur;
        const et = String(Math.floor(em / 60)).padStart(2, "0") + ":" + String(em % 60).padStart(2, "0");
        const { error: upErr } = await sb.from("appointments").update({ appointment_date: args.new_date, start_time: args.new_time, end_time: et, status: "pending" }).eq("id", args.appointment_id).eq("company_id", cid);
        log("🧠 reschedule result:", upErr ? `ERROR: ${upErr.message}` : "OK");
        txt = txt || "Remarcado para " + formatDate(args.new_date) + " " + args.new_time;
      } else if (fn === "check_availability") {
        log("🧠 Checking availability for:", args.date, "staff:", args.staff_id, "service:", args.service_id);
        
        // Real-time sync from Google Calendar before checking availability
        try {
          const syncUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/google-calendar/sync-from-google";
          const syncRes = await fetch(syncUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + Deno.env.get("SUPABASE_ANON_KEY") },
            body: JSON.stringify({ companyId: cid, staffId: args.staff_id || null }),
          });
          const syncData = await syncRes.json();
          log("🧠 Google Calendar sync result:", JSON.stringify(syncData).substring(0, 200));
        } catch (syncErr: any) {
          log("🧠 Google Calendar sync failed (non-fatal):", syncErr.message);
        }

        const dow = new Date(args.date + "T12:00:00").getDay();
        const { data: bh } = await sb.from("business_hours").select("*").eq("company_id", cid).eq("day_of_week", dow).single();
        if (!bh?.is_open) { txt = txt || "Fechado em " + formatDate(args.date); }
        else {
          // Get service duration for proper slot calculation
          const svcDur = args.service_id ? (ctx.svcs || []).find((s: any) => s.id === args.service_id)?.duration : null;
          const iv = ctx.cs?.slot_interval || 30; const mc = ctx.cs?.max_capacity_per_slot || 1;
          
          // Get existing appointments (includes both local and google_calendar source)
          let exQuery = sb.from("appointments").select("start_time, end_time, staff_id").eq("company_id", cid).eq("appointment_date", args.date).in("status", ["pending", "confirmed"]);
          const { data: ex } = await exQuery;
          
          const { data: bl } = await sb.from("time_blocks").select("start_time, end_time, staff_id").eq("company_id", cid).eq("block_date", args.date);
          const tm = (t: string) => { if (!t) return 0; const pp = t.split(":").map(Number); return pp[0] * 60 + pp[1]; };
          let cur = tm(bh.open_time); const end = tm(bh.close_time); const slots: string[] = [];
          const slotDur = svcDur || iv;
          
          while (cur + slotDur <= end) {
            const ss = String(Math.floor(cur / 60)).padStart(2, "0") + ":" + String(cur % 60).padStart(2, "0");
            
            // Check time blocks (filter by staff if specified)
            const blocked = (bl || []).some((x: any) => {
              if (args.staff_id && x.staff_id && x.staff_id !== args.staff_id) return false;
              if (!x.start_time && !x.end_time) return true;
              return cur < tm(x.end_time) && (cur + slotDur) > tm(x.start_time);
            });
            
            if (!blocked) {
              // Check appointment conflicts
              const conflicts = (ex || []).filter((x: any) => {
                if (args.staff_id && x.staff_id && x.staff_id !== args.staff_id) return false;
                return cur < tm(x.end_time) && (cur + slotDur) > tm(x.start_time);
              });
              if (conflicts.length < mc) slots.push(ss);
            }
            cur += iv;
          }
          
          log("🧠 Available slots:", slots.length);
          
          // If staff_id specified, show staff name
          const staffName = args.staff_id ? (ctx.staff || []).find((s: any) => s.id === args.staff_id)?.name : null;
          const dateLabel = formatDate(args.date);
          if (slots.length) {
            // Auto-send slots as interactive menu
            const { data: ws } = await sb.from("whatsapp_settings").select("base_url, instance_id, token, active").eq("company_id", cid).single();
            if (ws?.active && ws?.base_url && ws?.token) {
              const headerText = `Horários disponíveis ${dateLabel}${staffName ? " com " + staffName : ""} 📅\n\nEscolha um horário:`;
              const topSlots = slots.slice(0, 10);
              try {
                if (topSlots.length <= 3) {
                  // Use buttons for 1-3 options
                  const choices = topSlots.map(s => `${s}|slot_${s.replace(":", "")}`);
                  await sendMenuViaUazapi(
                    { base_url: ws.base_url, token: ws.token },
                    conv.phone.replace(/\D/g, ""),
                    { type: "button", text: headerText, choices, footerText: slots.length > 3 ? `+${slots.length - 3} horários disponíveis` : undefined }
                  );
                  log("🔘 ✅ Slots sent as buttons:", topSlots.length);
                } else {
                  // Use list for 4+ options
                  const choices = topSlots.map(s => `${s}|Horário disponível`);
                  await sendMenuViaUazapi(
                    { base_url: ws.base_url, token: ws.token },
                    conv.phone.replace(/\D/g, ""),
                    { type: "list", text: headerText, choices, title: "Ver horários", footerText: slots.length > 10 ? `Mostrando 10 de ${slots.length} horários` : undefined }
                  );
                  log("🔘 ✅ Slots sent as list:", topSlots.length);
                }
                txt = "__MENU_SENT__";
              } catch (e: any) {
                logErr("🔘 ❌ Auto-menu for slots failed:", e.message);
                // Fallback to text
                txt = txt || `Horários disponíveis ${dateLabel}${staffName ? " com " + staffName : ""}:\n\n${topSlots.map((s, i) => `${i + 1}. ${s}`).join("\n")}${slots.length > 10 ? `\n\n...e mais ${slots.length - 10} horários` : ""}`;
              }
            } else {
              txt = txt || `Horários disponíveis ${dateLabel}${staffName ? " com " + staffName : ""}: ${slots.slice(0, 8).join(", ")}${slots.length > 8 ? " e mais..." : ""}`;
            }
          } else {
            txt = txt || `Sem horários disponíveis em ${dateLabel}${staffName ? " com " + staffName : ""}`;
          }
        }
      } else if (fn === "request_handoff") {
        await sb.from("whatsapp_conversations").update({ handoff_requested: true, status: "handoff" }).eq("id", conv.id);
        txt = txt || "Transferindo para atendente! 🙋";
      } else if (fn === "save_client_name" && args.name) {
        await sb.from("whatsapp_conversations").update({ client_name: args.name }).eq("id", conv.id);
        log("🧠 Client name saved:", args.name);
      } else if (fn === "send_file" && args.file_url) {
        // Send file via UAZAPI
        const { data: ws } = await sb.from("whatsapp_settings").select("base_url, instance_id, token, active").eq("company_id", cid).single();
        if (ws?.active && ws?.base_url && ws?.token) {
          try {
            const fileType = args.file_type || "document";
            let endpoint = "/send/document";
            if (fileType === "image") endpoint = "/send/image";
            else if (fileType === "audio") endpoint = "/send/audio";
            
            const sendUrl = ws.base_url.replace(/\/$/, "") + endpoint;
            const sendBody: any = { number: conv.phone.replace(/\D/g, ""), url: args.file_url };
            if (fileType === "document") sendBody.fileName = args.file_name;
            if (fileType === "image") sendBody.caption = args.file_name;
            
            log("📎 Sending file:", sendUrl, args.file_name);
            const fRes = await fetch(sendUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", token: ws.token },
              body: JSON.stringify(sendBody),
            });
            log("📎 File send result:", fRes.status);
          } catch (e: any) {
            logErr("📎 File send error:", e.message);
          }
        }
        txt = txt || `Enviei o arquivo "${args.file_name}" pra você! 📎`;
      } else if (fn === "send_buttons" || fn === "send_list") {
        // Send interactive buttons or list via UAZAPI /send/menu
        const { data: ws } = await sb.from("whatsapp_settings").select("base_url, instance_id, token, active").eq("company_id", cid).single();
        let menuSentOk = false;
        if (ws?.active && ws?.base_url && ws?.token) {
          try {
            const menuType = fn === "send_buttons" ? "button" : "list";
            await sendMenuViaUazapi(
              { base_url: ws.base_url, token: ws.token },
              conv.phone.replace(/\D/g, ""),
              {
                type: menuType as "button" | "list",
                text: args.text,
                choices: args.choices || [],
                footerText: args.footer_text,
                title: args.title,
              }
            );
            log("🔘 ✅ Menu sent successfully! type:", menuType);
            menuSentOk = true;
            // Mark txt as __MENU_SENT__ so we skip sendHumanizedReply later
            txt = "__MENU_SENT__";
          } catch (e: any) {
            logErr("🔘 ❌ Menu send error:", e.message);
            // Fallback: send as plain text with numbered options
            const fallbackText = args.text + "\n\n" + (args.choices || []).map((c: string, i: number) => `${i + 1}. ${c.split("|")[0]}`).join("\n");
            txt = fallbackText;
          }
        }
        if (!menuSentOk && !txt) txt = args.text || "";
      }
      await sb.from("whatsapp_agent_logs").insert({ company_id: cid, conversation_id: conv.id, action: fn, details: args });
    }
  }

  const finalReply = txt || "Nao entendi. Digite 'atendente' para falar com alguem.";
  log("🧠 FINAL REPLY:", finalReply.substring(0, 150));
  return finalReply;
}
