import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function log(...args: any[]) {
  console.log("[automations]", new Date().toISOString(), ...args);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { event_type, company_id, phone, contact_name, value, instance_id } = body;

    // event_type: "button_click" | "text_reply" | "menu_select" | "timeout"
    // value: the button text, keyword matched, menu option selected, etc.

    if (!event_type || !company_id || !phone) {
      return new Response(JSON.stringify({ error: "Missing event_type, company_id, or phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("📥 Event:", event_type, "company:", company_id, "phone:", phone, "value:", value);

    // Find active automation flows for this company
    const { data: flows } = await supabase
      .from("automation_flows")
      .select("*")
      .eq("company_id", company_id)
      .eq("active", true);

    if (!flows || flows.length === 0) {
      return new Response(JSON.stringify({ ok: true, matched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalExecuted = 0;

    for (const flow of flows) {
      const nodes: any[] = flow.nodes || [];
      const edges: any[] = flow.edges || [];

      // Map trigger type to node type
      const triggerNodeType = {
        button_click: "trigger_button",
        text_reply: "trigger_text",
        menu_select: "trigger_menu",
        timeout: "trigger_timeout",
      }[event_type];

      // Find matching trigger nodes
      const triggerNodes = nodes.filter((n: any) => n.data?.nodeType === triggerNodeType);

      for (const triggerNode of triggerNodes) {
        const config = triggerNode.data?.config || {};
        let matched = false;

        // Check if this trigger matches the incoming event
        if (event_type === "button_click") {
          const btnText = (config.buttonText || "").toLowerCase().trim();
          matched = !btnText || (value || "").toLowerCase().trim().includes(btnText);
        } else if (event_type === "text_reply") {
          const keywords = (config.keywords || "").split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
          if (keywords.length === 0) {
            matched = true; // Match any text
          } else {
            const msg = (value || "").toLowerCase();
            matched = keywords.some((kw: string) => msg.includes(kw));
          }
        } else if (event_type === "menu_select") {
          const menuOpt = (config.menuOption || "").toLowerCase().trim();
          matched = !menuOpt || (value || "").toLowerCase().trim() === menuOpt;
        } else if (event_type === "timeout") {
          matched = true;
        }

        if (!matched) continue;

        log("✅ Trigger matched in flow:", flow.name, "node:", triggerNode.id);

        // Walk the graph from this trigger node, executing actions in order
        const visited = new Set<string>();
        const queue = [triggerNode.id];

        // BFS through connected action nodes
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          if (visited.has(currentId)) continue;
          visited.add(currentId);

          // Find outgoing edges
          const outgoing = edges.filter((e: any) => e.source === currentId);

          for (const edge of outgoing) {
            const targetNode = nodes.find((n: any) => n.id === edge.target);
            if (!targetNode || visited.has(targetNode.id)) continue;

            const actionType = targetNode.data?.nodeType;
            const actionConfig = targetNode.data?.config || {};

            try {
              await executeAction(supabase, {
                actionType,
                config: actionConfig,
                companyId: company_id,
                phone,
                contactName: contact_name,
                instanceId: instance_id,
              });

              // Log success
              await supabase.from("automation_logs").insert({
                flow_id: flow.id,
                company_id,
                contact_phone: phone,
                contact_name: contact_name || null,
                trigger_type: event_type,
                trigger_value: value || null,
                node_id: targetNode.id,
                action_type: actionType,
                status: "executed",
              });

              totalExecuted++;
              log("⚡ Executed action:", actionType, "for", phone);
            } catch (err: any) {
              log("❌ Action failed:", actionType, err.message);
              await supabase.from("automation_logs").insert({
                flow_id: flow.id,
                company_id,
                contact_phone: phone,
                contact_name: contact_name || null,
                trigger_type: event_type,
                trigger_value: value || null,
                node_id: targetNode.id,
                action_type: actionType,
                status: "error",
                error_message: err.message?.substring(0, 500),
              });
            }

            // Add target to queue so we continue walking
            queue.push(targetNode.id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, matched: totalExecuted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    log("❌ Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Execute actions ───

async function executeAction(
  supabase: any,
  ctx: {
    actionType: string;
    config: any;
    companyId: string;
    phone: string;
    contactName?: string;
    instanceId?: string;
  }
) {
  const { actionType, config, companyId, phone, contactName, instanceId } = ctx;

  if (actionType === "action_send_message") {
    const ws = await getWsCredentials(supabase, companyId, instanceId);
    if (!ws) throw new Error("WhatsApp não configurado");

    const msg = (config.message || "").replace(/\{\{nome\}\}/gi, contactName || "");
    
    if (config.msgType === "button" && config.buttons) {
      const btnLines = config.buttons.split("\n").filter(Boolean).slice(0, 3);
      const choices = btnLines.map((b: string) => `${b.trim()}|${b.trim().toLowerCase().replace(/\s+/g, "_")}`);
      await sendMenu(ws, phone, { type: "button", text: msg, choices });
    } else {
      await sendText(ws, phone, msg);
    }
  } else if (actionType === "action_tag") {
    if (config.tag) {
      await supabase.from("contact_tags").upsert(
        { company_id: companyId, phone, name: contactName || null, tag: config.tag },
        { onConflict: "company_id,phone,tag", ignoreDuplicates: true }
      );
    }
  } else if (actionType === "action_schedule") {
    if (config.scheduleAction === "send_link") {
      const { data: company } = await supabase
        .from("companies")
        .select("slug")
        .eq("id", companyId)
        .single();
      if (company?.slug) {
        const ws = await getWsCredentials(supabase, companyId, instanceId);
        if (ws) {
          const link = `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app")}/agendar/${company.slug}`;
          await sendText(ws, phone, `Olá${contactName ? ` ${contactName}` : ""}! Agende seu horário aqui: ${link}`);
        }
      }
    }
  } else if (actionType === "action_move_campaign") {
    if (config.targetCampaignId) {
      await supabase.from("mass_campaign_contacts").insert({
        campaign_id: config.targetCampaignId,
        phone,
        name: contactName || phone,
        status: "pending",
      });
    }
  } else if (actionType === "action_wait") {
    const seconds = config.seconds || 5;
    await new Promise((r) => setTimeout(r, seconds * 1000));
  }
}

// ─── WhatsApp helpers (duplicated for edge function isolation) ───

async function getWsCredentials(sb: any, companyId: string, instanceId?: string) {
  const { data: ws } = await sb.from("whatsapp_settings").select("base_url, token, instance_id").eq("company_id", companyId).maybeSingle();
  const baseUrl = ws?.base_url;
  if (!baseUrl) return null;

  if (instanceId) {
    const { data: inst } = await sb.from("whatsapp_instances").select("instance_name, token, status").eq("id", instanceId).maybeSingle();
    if (inst?.token) return { base_url: baseUrl, instance_id: inst.instance_name, token: inst.token };
  }

  if (ws?.token) return { base_url: baseUrl, instance_id: ws.instance_id || "default", token: ws.token };
  return null;
}

async function sendText(ws: { base_url: string; token: string }, phone: string, text: string) {
  const url = ws.base_url.replace(/\/$/, "") + "/send/text";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: ws.token },
    body: JSON.stringify({ number: phone, text }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Send error ${res.status}: ${errText.substring(0, 200)}`);
  }
}

async function sendMenu(
  ws: { base_url: string; token: string },
  phone: string,
  options: { type: string; text: string; choices: string[] }
) {
  const url = ws.base_url.replace(/\/$/, "") + "/send/menu";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: ws.token },
    body: JSON.stringify({ number: phone, type: options.type, text: options.text, choices: options.choices }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Menu error ${res.status}: ${errText.substring(0, 200)}`);
  }
}
