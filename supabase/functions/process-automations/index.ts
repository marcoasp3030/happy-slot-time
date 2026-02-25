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
    const { event_type, company_id, phone, contact_name, value, instance_id, campaign_id, flow_id } = body;

    // event_type: "button_click" | "text_reply" | "menu_select" | "timeout"
    // value: the button text, keyword matched, menu option selected, etc.

    if (!event_type || !company_id || !phone) {
      return new Response(JSON.stringify({ error: "Missing event_type, company_id, or phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("📥 Event:", event_type, "company:", company_id, "phone:", phone, "value:", value, "flow_id:", flow_id, "campaign_id:", campaign_id);

    // Find active automation flows for this company
    let flowsQuery = supabase
      .from("automation_flows")
      .select("*")
      .eq("company_id", company_id)
      .eq("active", true);

    // If a specific flow_id is provided (from mass campaign), filter to that flow only
    if (flow_id) {
      flowsQuery = flowsQuery.eq("id", flow_id);
    } else if (campaign_id) {
      flowsQuery = flowsQuery.eq("campaign_id", campaign_id);
    }

    const { data: flows } = await flowsQuery;

    if (!flows || flows.length === 0) {
      log("⚠️ No active flows found for company:", company_id, "flow_id:", flow_id, "campaign_id:", campaign_id);
      return new Response(JSON.stringify({ ok: true, matched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    log("📋 Found", flows.length, "active flows to process");

    let totalExecuted = 0;

    for (const flow of flows) {
      const nodes: any[] = flow.nodes || [];
      const edges: any[] = flow.edges || [];

      // If called directly from mass campaign with flow_id, execute all action nodes
      // that are entry points (not connected from other action nodes) without requiring trigger match
      const isDirectCampaignExecution = !!flow_id && !!campaign_id;
      
      if (isDirectCampaignExecution) {
        log("🚀 Direct campaign execution for flow:", flow.name);
        
        // Find all action/condition nodes that are entry points (source of edges from no other action node)
        // Or simply find nodes that have no incoming edges (root nodes) and are action types
        const targetNodeIds = new Set(edges.map((e: any) => e.target));
        const sourceNodeIds = new Set(edges.map((e: any) => e.source));
        
        // Get all action nodes
        const actionNodes = nodes.filter((n: any) => {
          const nt = n.data?.nodeType || "";
          return nt.startsWith("action_") || nt === "condition";
        });
        
        // Find root action nodes: either they have no incoming edge, or their only incoming edges are from trigger nodes
        const triggerNodeIds = new Set(
          nodes.filter((n: any) => (n.data?.nodeType || "").startsWith("trigger_")).map((n: any) => n.id)
        );
        
        // Start points: action nodes whose incoming edges all come from triggers (or have no incoming edges)
        const startNodes = actionNodes.filter((n: any) => {
          const incomingEdges = edges.filter((e: any) => e.target === n.id);
          if (incomingEdges.length === 0) return true; // No incoming = root action
          return incomingEdges.every((e: any) => triggerNodeIds.has(e.source));
        });
        
        if (startNodes.length === 0) {
          // Fallback: just get first action nodes connected from any trigger
          const triggerConnectedIds = edges
            .filter((e: any) => triggerNodeIds.has(e.source))
            .map((e: any) => e.target);
          
          for (const targetId of triggerConnectedIds) {
            const targetNode = nodes.find((n: any) => n.id === targetId);
            if (targetNode) startNodes.push(targetNode);
          }
        }
        
        log("📌 Found", startNodes.length, "entry action nodes");
        
        // Execute from each start node, walking the graph
        const visited = new Set<string>();
        const queue = [...startNodes.map((n: any) => n.id)];
        
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          if (visited.has(currentId)) continue;
          visited.add(currentId);
          
          const currentNode = nodes.find((n: any) => n.id === currentId);
          if (!currentNode) continue;
          
          const actionType = currentNode.data?.nodeType;
          if (!actionType || actionType.startsWith("trigger_")) {
            // Skip trigger nodes, just follow edges
            const outgoing = edges.filter((e: any) => e.source === currentId);
            for (const edge of outgoing) {
              if (!visited.has(edge.target)) queue.push(edge.target);
            }
            continue;
          }
          
          const actionConfig = currentNode.data?.config || {};
          
          try {
            // Handle condition nodes
            if (actionType === "condition") {
              const condResult = await evaluateCondition(supabase, actionConfig, company_id, phone, value);
              log("🔀 Condition result:", condResult, "for node:", currentId);
              
              // Follow true or false handle
              const outgoing = edges.filter((e: any) => e.source === currentId);
              for (const edge of outgoing) {
                const handleId = edge.sourceHandle;
                if ((condResult && handleId === "true") || (!condResult && handleId === "false") || !handleId) {
                  if (!visited.has(edge.target)) queue.push(edge.target);
                }
              }
            } else {
              await executeAction(supabase, {
                actionType,
                config: actionConfig,
                companyId: company_id,
                phone,
                contactName: contact_name,
                instanceId: instance_id,
              });
              
              // Follow edges
              const outgoing = edges.filter((e: any) => e.source === currentId);
              for (const edge of outgoing) {
                if (!visited.has(edge.target)) queue.push(edge.target);
              }
            }
            
            await supabase.from("automation_logs").insert({
              flow_id: flow.id,
              company_id,
              contact_phone: phone,
              contact_name: contact_name || null,
              trigger_type: "campaign_send",
              trigger_value: campaign_id,
              node_id: currentId,
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
              trigger_type: "campaign_send",
              trigger_value: campaign_id,
              node_id: currentId,
              action_type: actionType,
              status: "error",
              error_message: err.message?.substring(0, 500),
            });
          }
        }
        
        continue; // Skip normal trigger matching for this flow
      }

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
              if (actionType === "condition") {
                const condResult = await evaluateCondition(supabase, actionConfig, company_id, phone, value);
                log("🔀 Condition result:", condResult, "for node:", targetNode.id);
                
                const condOutgoing = edges.filter((e: any) => e.source === targetNode.id);
                for (const condEdge of condOutgoing) {
                  const handleId = condEdge.sourceHandle;
                  if ((condResult && handleId === "true") || (!condResult && handleId === "false") || !handleId) {
                    if (!visited.has(condEdge.target)) queue.push(condEdge.target);
                  }
                }
                visited.add(targetNode.id);
              } else {
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
                
                // Add target to queue so we continue walking
                queue.push(targetNode.id);
              }
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

// ─── Evaluate condition nodes ───

async function evaluateCondition(
  supabase: any,
  config: any,
  companyId: string,
  phone: string,
  value?: string
): Promise<boolean> {
  const condType = config.conditionType || "text_contains";
  const condValue = (config.conditionValue || "").trim();
  
  if (condType === "has_tag") {
    const { data } = await supabase
      .from("contact_tags")
      .select("id")
      .eq("company_id", companyId)
      .eq("phone", phone)
      .eq("tag", condValue)
      .maybeSingle();
    return !!data;
  } else if (condType === "has_appointment") {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("appointments")
      .select("id")
      .eq("company_id", companyId)
      .eq("client_phone", phone)
      .gte("appointment_date", today)
      .in("status", ["pending", "confirmed"])
      .limit(1);
    return !!(data && data.length > 0);
  } else if (condType === "text_contains") {
    if (!condValue) return true;
    return (value || "").toLowerCase().includes(condValue.toLowerCase());
  } else if (condType === "text_equals") {
    return (value || "").toLowerCase().trim() === condValue.toLowerCase();
  }
  
  return false;
}

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
