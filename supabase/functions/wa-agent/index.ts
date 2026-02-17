import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const raw = await req.text();
    console.log("[wh] body:", raw.substring(0, 500));
    const b = JSON.parse(raw);
    const phone = b.phone || b.from || b.data?.from || b.data?.key?.remoteJid?.replace("@s.whatsapp.net", "") || null;
    const msg = b.message || b.text || b.data?.message?.conversation || b.data?.message?.extendedTextMessage?.text || null;
    const cid = new URL(req.url).searchParams.get("company_id");
    if (!cid) return json({ error: "company_id required" }, 400);
    if (!phone || !msg) return json({ ok: true, skipped: "no_message" });
    console.log("[wh] from:", phone, "msg:", msg.substring(0, 80));
    const { data: ag } = await sb.from("whatsapp_agent_settings").select("*").eq("company_id", cid).single();
    if (!ag?.enabled) return json({ ok: true, skipped: "agent_disabled" });
    let { data: conv } = await sb.from("whatsapp_conversations").select("*").eq("company_id", cid).eq("phone", phone).eq("status", "active").order("created_at", { ascending: false }).limit(1).single();
    if (!conv) { const { data: nc } = await sb.from("whatsapp_conversations").insert({ company_id: cid, phone, status: "active" }).select().single(); conv = nc; }
    if (!conv) throw new Error("No conversation");
    if (conv.handoff_requested) return json({ ok: true, skipped: "handoff" });
    await sb.from("whatsapp_messages").insert({ conversation_id: conv.id, company_id: cid, direction: "incoming", message_type: "text", content: msg });
    await sb.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
    const ctx = await getCtx(sb, cid, phone, conv.id);
    const reply = await aiReply(sb, cid, conv, ctx, msg, ag);
    await sb.from("whatsapp_messages").insert({ conversation_id: conv.id, company_id: cid, direction: "outgoing", message_type: "text", content: reply });
    await send(sb, cid, phone, reply);
    console.log("[wh] sent:", reply.substring(0, 80));
    return json({ ok: true, response: reply });
  } catch (e: any) { console.error("[wh] err:", e); return json({ error: e.message || String(e) }, 500); }
});

async function getCtx(sb: any, cid: string, ph: string, convId: string) {
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

const DN = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

async function aiReply(sb: any, cid: string, conv: any, ctx: any, userMsg: string, ag: any) {
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
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools }),
  });
  if (!r.ok) { const t = await r.text(); console.error("AI err:", r.status, t); throw new Error("AI " + r.status); }
  const ai = await r.json();
  const ch = ai.choices?.[0];
  let txt = ch?.message?.content || "";
  if (ch?.message?.tool_calls) {
    for (const tc of ch.message.tool_calls) {
      let args: any = {}; try { args = JSON.parse(tc.function.arguments); } catch {}
      const fn = tc.function.name;
      if (fn === "confirm_appointment") { await sb.from("appointments").update({ status: "confirmed" }).eq("id", args.appointment_id).eq("company_id", cid); txt = txt || "Agendamento confirmado!"; }
      else if (fn === "cancel_appointment") { await sb.from("appointments").update({ status: "canceled" }).eq("id", args.appointment_id).eq("company_id", cid); txt = txt || "Agendamento cancelado."; }
      else if (fn === "reschedule_appointment") {
        const { data: ap } = await sb.from("appointments").select("services(duration)").eq("id", args.appointment_id).single();
        const dur = ap?.services?.duration || 30; const p = (args.new_time || "09:00").split(":").map(Number);
        const em = p[0] * 60 + p[1] + dur; const et = String(Math.floor(em / 60)).padStart(2, "0") + ":" + String(em % 60).padStart(2, "0");
        await sb.from("appointments").update({ appointment_date: args.new_date, start_time: args.new_time, end_time: et, status: "pending" }).eq("id", args.appointment_id).eq("company_id", cid);
        txt = txt || "Remarcado para " + args.new_date + " " + args.new_time;
      } else if (fn === "check_availability") {
        const sl = await getSlots(sb, cid, args.date);
        txt = txt || (sl.length ? "Horarios " + args.date + ": " + sl.slice(0, 5).join(", ") : "Sem horarios em " + args.date);
      } else if (fn === "request_handoff") {
        await sb.from("whatsapp_conversations").update({ handoff_requested: true, status: "handoff" }).eq("id", conv.id);
        txt = txt || "Transferindo para atendente!";
      }
      await sb.from("whatsapp_agent_logs").insert({ company_id: cid, conversation_id: conv.id, action: fn, details: args });
    }
  }
  return txt || "Nao entendi. Digite 'atendente' para falar com alguem.";
}

async function getSlots(sb: any, cid: string, dt: string) {
  const dow = new Date(dt + "T12:00:00").getDay();
  const { data: bh } = await sb.from("business_hours").select("*").eq("company_id", cid).eq("day_of_week", dow).single();
  if (!bh?.is_open) return [];
  const { data: cs } = await sb.from("company_settings").select("slot_interval, max_capacity_per_slot").eq("company_id", cid).single();
  const iv = cs?.slot_interval || 30; const mc = cs?.max_capacity_per_slot || 1;
  const { data: ex } = await sb.from("appointments").select("start_time, end_time").eq("company_id", cid).eq("appointment_date", dt).in("status", ["pending", "confirmed"]);
  const { data: bl } = await sb.from("time_blocks").select("start_time, end_time").eq("company_id", cid).eq("block_date", dt);
  const tm = (t: string) => { if (!t) return 0; const p = t.split(":").map(Number); return p[0] * 60 + p[1]; };
  let c = tm(bh.open_time); const e = tm(bh.close_time); const r: string[] = [];
  while (c < e) {
    const s = String(Math.floor(c / 60)).padStart(2, "0") + ":" + String(c % 60).padStart(2, "0");
    const bk = (bl || []).some((x: any) => (!x.start_time && !x.end_time) || (c >= tm(x.start_time) && c < tm(x.end_time)));
    if (!bk && (ex || []).filter((x: any) => c >= tm(x.start_time) && c < tm(x.end_time)).length < mc) r.push(s);
    c += iv;
  }
  return r;
}

async function send(sb: any, cid: string, ph: string, msg: string) {
  const { data: ws } = await sb.from("whatsapp_settings").select("base_url, token, active").eq("company_id", cid).single();
  if (!ws?.active || !ws?.base_url || !ws?.token) return;
  const r = await fetch(ws.base_url.replace(/\/$/, "") + "/send/text", {
    method: "POST", headers: { "Content-Type": "application/json", token: ws.token },
    body: JSON.stringify({ number: ph.replace(/\D/g, ""), text: msg }),
  });
  if (!r.ok) console.error("send err:", r.status, await r.text());
}
