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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const raw = await req.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { return new Response(JSON.stringify({ ok: true, skipped: "bad_json" }), { headers: jsonH }); }

    // ─── Detect UAZAPI webhook payload (no "action" or "type" field, has event/data/message structure) ───
    const uazapiCompanyId = new URL(req.url).searchParams.get("company_id");
    const isUazapiWebhook = uazapiCompanyId && !body.type && !body.action && (
      body.event || body.data || (body.phone && body.message && !body.appointment_id)
    );

    if (isUazapiWebhook) {
      console.log("[send-whatsapp] 📩 UAZAPI webhook detected, cid:", uazapiCompanyId);
      console.log("[send-whatsapp] payload:", raw.substring(0, 400));

      // Extract phone and message from various UAZAPI payload formats
      const phone = body.phone || body.from || body.data?.from || 
        body.data?.key?.remoteJid?.replace("@s.whatsapp.net", "") || null;
      const msg = body.message || body.text || body.data?.message?.conversation || 
        body.data?.message?.extendedTextMessage?.text || null;

      if (!phone || !msg) {
        console.log("[send-whatsapp] no phone/msg, skipping");
        return new Response(JSON.stringify({ ok: true, skipped: "no_msg" }), { headers: jsonH });
      }

      console.log("[send-whatsapp] phone:", phone, "msg:", msg.substring(0, 80));
      const t0 = Date.now();
      const result = await handleAgent(supabase, uazapiCompanyId, phone, msg);
      
      await supabase.from("whatsapp_agent_logs").insert({
        company_id: uazapiCompanyId,
        conversation_id: result.conversation_id || null,
        action: "response_sent",
        details: { response_time_ms: Date.now() - t0, is_audio: false },
      }).then(() => {}).catch(() => {});

      return new Response(JSON.stringify({ ok: true, ...result }), { headers: jsonH });
    }

    // ─── Agent processing route (internal call) ───
    if (body.action === "agent-process") {
      const result = await handleAgent(supabase, body.company_id, body.phone, body.message);
      return new Response(JSON.stringify(result), { headers: jsonH, status: result.error ? 500 : 200 });
    }

    // ─── Original send-whatsapp logic ───
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
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: jsonH });
  }
});

// ─── UAZAPI send ───
async function sendUazapiMessage(settings: { base_url: string; instance_id: string; token: string }, phone: string, message: string): Promise<any> {
  const url = settings.base_url.replace(/\/$/, "") + "/send/text";
  console.log(`[send-whatsapp] POST ${url} phone:${phone} len:${message.length}`);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", token: settings.token }, body: JSON.stringify({ number: phone, text: message }) });
  const text = await res.text();
  console.log(`[send-whatsapp] ${res.status} ${text.substring(0, 300)}`);
  if (!res.ok) throw new Error(`UAZAPI error ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function formatDate(dateStr: string): string { const [y, m, d] = dateStr.split("-"); return `${d}/${m}/${y}`; }

// ─── AI Agent Logic ───
const DN = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

async function handleAgent(sb: any, cid: string, phone: string, msg: string): Promise<any> {
  if (!cid || !phone || !msg) return { error: "missing fields" };
  console.log("[agent] cid:", cid, "ph:", phone, "msg:", msg.substring(0, 80));

  const { data: ag } = await sb.from("whatsapp_agent_settings").select("*").eq("company_id", cid).single();
  if (!ag?.enabled) return { ok: true, skipped: "agent_disabled" };

  let { data: conv } = await sb.from("whatsapp_conversations").select("*").eq("company_id", cid).eq("phone", phone).eq("status", "active").order("created_at", { ascending: false }).limit(1).single();
  if (!conv) { const { data: nc } = await sb.from("whatsapp_conversations").insert({ company_id: cid, phone, status: "active" }).select().single(); conv = nc; }
  if (!conv) return { error: "conv_fail" };
  if (conv.handoff_requested) return { ok: true, skipped: "handoff" };

  await sb.from("whatsapp_messages").insert({ conversation_id: conv.id, company_id: cid, direction: "incoming", message_type: "text", content: msg });
  await sb.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

  const ctx = await loadCtx(sb, cid, phone, conv.id);
  const reply = await callAI(sb, cid, conv, ctx, msg);

  await sb.from("whatsapp_messages").insert({ conversation_id: conv.id, company_id: cid, direction: "outgoing", message_type: "text", content: reply });

  const { data: ws } = await sb.from("whatsapp_settings").select("base_url, token, active").eq("company_id", cid).single();
  if (ws?.active && ws?.base_url && ws?.token) {
    try { await sendUazapiMessage({ base_url: ws.base_url, instance_id: "", token: ws.token }, phone.replace(/\D/g, ""), reply); }
    catch (e: any) { console.error("[agent] send err:", e.message); }
  }
  console.log("[agent] reply:", reply.substring(0, 80));
  return { ok: true, response: reply };
}

async function loadCtx(sb: any, cid: string, ph: string, convId: string) {
  const cp = ph.replace(/\D/g, "");
  const [m, a, c, s, h, k, cs] = await Promise.all([
    sb.from("whatsapp_messages").select("direction, content, created_at").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(20),
    sb.from("appointments").select("id, client_name, appointment_date, start_time, end_time, status, services(name), staff(name)").eq("company_id", cid).or("client_phone.eq." + cp + ",client_phone.eq.+" + cp).in("status", ["pending", "confirmed"]).order("appointment_date", { ascending: true }).limit(10),
    sb.from("companies").select("name, address, phone").eq("id", cid).single(),
    sb.from("services").select("name, duration, price, description").eq("company_id", cid).eq("active", true),
    sb.from("business_hours").select("day_of_week, open_time, close_time, is_open").eq("company_id", cid),
    sb.from("whatsapp_knowledge_base").select("category, title, content").eq("company_id", cid).eq("active", true),
    sb.from("company_settings").select("slot_interval, max_capacity_per_slot, min_advance_hours").eq("company_id", cid).single(),
  ]);
  return { msgs: (m.data || []).reverse(), appts: a.data || [], co: c.data || {}, svcs: s.data || [], hrs: h.data || [], kb: k.data || [], cs: cs.data || {} };
}

async function callAI(sb: any, cid: string, conv: any, ctx: any, userMsg: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");

  const hrs = (ctx.hrs || []).sort((a: any, b: any) => a.day_of_week - b.day_of_week).map((x: any) => DN[x.day_of_week] + ": " + (x.is_open ? (x.open_time || "").substring(0, 5) + "-" + (x.close_time || "").substring(0, 5) : "Fechado")).join("; ");
  const svcs = (ctx.svcs || []).map((x: any) => x.name + " " + x.duration + "min R$" + (x.price || "?")).join("; ");
  const kbs = (ctx.kb || []).map((x: any) => x.title + ": " + x.content).join("; ");
  const appts = (ctx.appts || []).map((x: any, i: number) => (i + 1) + "." + (x.services?.name || "?") + " " + x.appointment_date + " " + (x.start_time || "").substring(0, 5) + " " + x.status).join("; ");

  const sys = "Assistente virtual de " + (ctx.co.name || "empresa") + ". Portugues BR, curto, objetivo. Empresa: " + (ctx.co.name || "") + " End: " + (ctx.co.address || "") + " Tel: " + (ctx.co.phone || "") + ". Horarios: " + hrs + ". Servicos: " + svcs + ". Info: " + kbs + ". Agendamentos cliente: " + appts + ". Use tools para confirmar/cancelar/reagendar. Max 3 frases. Emojis moderados.";

  const messages: any[] = [{ role: "system", content: sys }];
  for (const m of ctx.msgs) messages.push({ role: m.direction === "incoming" ? "user" : "assistant", content: m.content || "" });
  messages.push({ role: "user", content: userMsg });

  const tools = [
    { type: "function", function: { name: "confirm_appointment", description: "Confirma agendamento", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
    { type: "function", function: { name: "cancel_appointment", description: "Cancela agendamento", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
    { type: "function", function: { name: "check_availability", description: "Horarios disponiveis", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } } },
    { type: "function", function: { name: "reschedule_appointment", description: "Reagenda", parameters: { type: "object", properties: { appointment_id: { type: "string" }, new_date: { type: "string" }, new_time: { type: "string" } }, required: ["appointment_id", "new_date", "new_time"] } } },
    { type: "function", function: { name: "request_handoff", description: "Transfere humano", parameters: { type: "object", properties: {} } } },
  ];

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools }) });
  if (!r.ok) { const t = await r.text(); console.error("AI err:", r.status, t); throw new Error("AI " + r.status); }

  const ai = await r.json();
  const ch = ai.choices?.[0];
  let txt = ch?.message?.content || "";

  if (ch?.message?.tool_calls) {
    for (const tc of ch.message.tool_calls) {
      let args: any = {}; try { args = JSON.parse(tc.function.arguments); } catch {}
      const fn = tc.function.name;
      if (fn === "confirm_appointment") { await sb.from("appointments").update({ status: "confirmed" }).eq("id", args.appointment_id).eq("company_id", cid); txt = txt || "Agendamento confirmado! ✅"; }
      else if (fn === "cancel_appointment") { await sb.from("appointments").update({ status: "canceled" }).eq("id", args.appointment_id).eq("company_id", cid); txt = txt || "Agendamento cancelado."; }
      else if (fn === "reschedule_appointment") {
        const { data: ap } = await sb.from("appointments").select("services(duration)").eq("id", args.appointment_id).single();
        const dur = ap?.services?.duration || 30; const p = (args.new_time || "09:00").split(":").map(Number);
        const em = p[0] * 60 + p[1] + dur; const et = String(Math.floor(em / 60)).padStart(2, "0") + ":" + String(em % 60).padStart(2, "0");
        await sb.from("appointments").update({ appointment_date: args.new_date, start_time: args.new_time, end_time: et, status: "pending" }).eq("id", args.appointment_id).eq("company_id", cid);
        txt = txt || "Remarcado para " + args.new_date + " " + args.new_time;
      } else if (fn === "check_availability") {
        const dow = new Date(args.date + "T12:00:00").getDay();
        const { data: bh } = await sb.from("business_hours").select("*").eq("company_id", cid).eq("day_of_week", dow).single();
        if (!bh?.is_open) { txt = txt || "Fechado em " + args.date; }
        else {
          const iv = ctx.cs?.slot_interval || 30; const mc = ctx.cs?.max_capacity_per_slot || 1;
          const { data: ex } = await sb.from("appointments").select("start_time, end_time").eq("company_id", cid).eq("appointment_date", args.date).in("status", ["pending", "confirmed"]);
          const { data: bl } = await sb.from("time_blocks").select("start_time, end_time").eq("company_id", cid).eq("block_date", args.date);
          const tm = (t: string) => { if (!t) return 0; const pp = t.split(":").map(Number); return pp[0] * 60 + pp[1]; };
          let cur = tm(bh.open_time); const end = tm(bh.close_time); const slots: string[] = [];
          while (cur < end) { const ss = String(Math.floor(cur / 60)).padStart(2, "0") + ":" + String(cur % 60).padStart(2, "0"); const blocked = (bl || []).some((x: any) => (!x.start_time && !x.end_time) || (cur >= tm(x.start_time) && cur < tm(x.end_time))); if (!blocked && (ex || []).filter((x: any) => cur >= tm(x.start_time) && cur < tm(x.end_time)).length < mc) slots.push(ss); cur += iv; }
          txt = txt || (slots.length ? "Horarios " + args.date + ": " + slots.slice(0, 5).join(", ") : "Sem horarios em " + args.date);
        }
      } else if (fn === "request_handoff") {
        await sb.from("whatsapp_conversations").update({ handoff_requested: true, status: "handoff" }).eq("id", conv.id);
        txt = txt || "Transferindo para atendente! 🙋";
      }
      await sb.from("whatsapp_agent_logs").insert({ company_id: cid, conversation_id: conv.id, action: fn, details: args });
    }
  }
  return txt || "Nao entendi. Digite 'atendente' para falar com alguem.";
}
