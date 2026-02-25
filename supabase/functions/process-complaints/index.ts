/**
 * process-complaints — Edge Function
 *
 * Runs every 5 minutes (via pg_cron).
 * Finds WhatsApp conversations marked as `current_intent = 'complaint_pending'`
 * that have been inactive for 10+ minutes, then:
 *  1. Reads the FULL conversation history
 *  2. Calls AI to extract rich, structured details
 *  3. Upserts the atendimento record (insert or update with more complete data)
 *  4. Resets the conversation intent
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function log(...args: any[]) {
  console.log("[process-complaints]", new Date().toISOString(), ...args);
}

// ─── AI extraction with full conversation history ───────────────────────────
async function extractAtendimentoDetails(
  conversationText: string,
  apiKey: string
): Promise<{
  client_name: string | null;
  condominium_name: string | null;
  problem_type: string;
  priority: string;
  description: string;
  notes: string | null;
}> {
  const prompt = `Você é um analista de atendimento ao cliente. Analise o histórico COMPLETO de conversa abaixo e extraia as informações do problema relatado.

HISTÓRICO DA CONVERSA:
${conversationText}

Extraia APENAS em JSON válido (sem markdown, sem explicação extra):
{
  "client_name": "nome completo do cliente ou null",
  "condominium_name": "nome do condomínio, loja, local ou endereço mencionado ou null",
  "problem_type": "UMA opção: Reclamação de Produto | Reclamação da Loja | Reclamação de Atendimento | Problema de Entrega | Solicitação de Reembolso | Problema Técnico | Problema de Infraestrutura | Reclamação de Serviço | Outros",
  "priority": "urgente (risco imediato/dano grave) | alta (impacto sério) | normal (problema comum) | baixa (sugestão/menor impacto)",
  "description": "Descrição objetiva e completa do problema relatado pelo cliente em 2-4 frases, incluindo o que aconteceu, quando, onde e impacto",
  "notes": "Detalhes adicionais relevantes: número de pedido, produto específico, horário do fato, tentativas anteriores de solução, qualquer contexto extra útil para resolver o problema. Se não houver, retorne null"
}

Responda SOMENTE com o JSON, sem nenhum texto antes ou depois.`;

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      temperature: 0,
    }),
  });

  if (!aiRes.ok) throw new Error(`AI error: ${aiRes.status}`);

  const aiData = await aiRes.json();
  const raw = aiData.choices?.[0]?.message?.content?.trim() || "{}";
  const clean = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  return {
    client_name: parsed.client_name || null,
    condominium_name: parsed.condominium_name || null,
    problem_type: parsed.problem_type || "Outros",
    priority: parsed.priority || "normal",
    description: parsed.description || "Reclamação registrada via WhatsApp",
    notes: parsed.notes || null,
  };
}

// ─── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    // Find conversations pending complaint registration inactive for 10+ minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: conversations, error: convErr } = await sb
      .from("whatsapp_conversations")
      .select("id, company_id, phone, client_name, last_message_at")
      .eq("current_intent", "complaint_pending")
      .lt("last_message_at", tenMinutesAgo);

    if (convErr) {
      log("❌ Error fetching conversations:", convErr.message);
      return new Response(JSON.stringify({ ok: false, error: convErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log(`📋 Found ${conversations?.length ?? 0} conversations with pending complaints`);

    if (!conversations || conversations.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const conv of conversations) {
      try {
        log(`📋 Processing conversation: ${conv.id} | phone: ${conv.phone} | last_msg: ${conv.last_message_at}`);

        // Fetch full conversation history (last 50 messages)
        const { data: messages } = await sb
          .from("whatsapp_messages")
          .select("direction, content, created_at")
          .eq("conversation_id", conv.id)
          .not("content", "is", null)
          .not("content", "eq", "")
          .not("delivery_status", "eq", "locking")
          .order("created_at", { ascending: true })
          .limit(50);

        if (!messages || messages.length === 0) {
          log(`⚠️ No messages found for conversation ${conv.id} — skipping`);
          // Reset intent to avoid infinite loop
          await sb.from("whatsapp_conversations")
            .update({ current_intent: null })
            .eq("id", conv.id);
          continue;
        }

        // Build conversation transcript
        const transcript = messages
          .map((m: any) => {
            const role = m.direction === "incoming" ? "Cliente" : "Agente";
            const time = new Date(m.created_at).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            // Clean button/system messages for readability
            const content = (m.content || "")
              .replace(/\[BOTÃO CLICADO:.*?\]/g, "")
              .replace(/\[ÁUDIO TRANSCRITO\]/g, "[áudio]")
              .trim();
            if (!content) return null;
            return `[${time}] ${role}: ${content}`;
          })
          .filter(Boolean)
          .join("\n");

        log(`📋 Transcript built: ${transcript.length} chars, ${messages.length} messages`);

        // Use AI to extract complete atendimento details
        let details: Awaited<ReturnType<typeof extractAtendimentoDetails>>;

        if (apiKey) {
          try {
            details = await extractAtendimentoDetails(transcript, apiKey);
            log(`📋 AI extracted: type=${details.problem_type} priority=${details.priority} client=${details.client_name}`);
          } catch (aiErr: any) {
            log(`⚠️ AI extraction failed, using fallback: ${aiErr.message}`);
            details = {
              client_name: conv.client_name || null,
              condominium_name: null,
              problem_type: "Outros",
              priority: "normal",
              description: messages
                .filter((m: any) => m.direction === "incoming")
                .slice(0, 3)
                .map((m: any) => m.content)
                .join(" | ")
                .substring(0, 500),
              notes: null,
            };
          }
        } else {
          log("⚠️ No API key, using fallback extraction");
          details = {
            client_name: conv.client_name || null,
            condominium_name: null,
            problem_type: "Outros",
            priority: "normal",
            description: messages
              .filter((m: any) => m.direction === "incoming")
              .slice(0, 3)
              .map((m: any) => m.content)
              .join(" | ")
              .substring(0, 500),
            notes: null,
          };
        }

        const cleanPhone = conv.phone.replace(/\D/g, "");

        // Upsert: if a record already exists for this client today, update with richer data
        // Uses INSERT ... ON CONFLICT DO UPDATE to enrich existing records
        const { error: upsertErr } = await sb.from("atendimentos").upsert(
          {
            company_id: conv.company_id,
            phone: cleanPhone,
            client_name: details.client_name || conv.client_name || null,
            condominium_name: details.condominium_name || null,
            problem_type: details.problem_type,
            description: details.description,
            priority: details.priority,
            notes: details.notes,
            status: "aberto",
          },
          {
            onConflict: "company_id,phone,date_trunc_day",
            ignoreDuplicates: false, // update with richer data
          }
        );

        // If upsert fails (e.g. no unique index for upsert), try insert then update
        if (upsertErr) {
          log(`⚠️ Upsert failed (${upsertErr.message}), trying insert with on-conflict update...`);
          
          // Try plain insert first
          const { error: insertErr } = await sb.from("atendimentos").insert({
            company_id: conv.company_id,
            phone: cleanPhone,
            client_name: details.client_name || conv.client_name || null,
            condominium_name: details.condominium_name || null,
            problem_type: details.problem_type,
            description: details.description,
            priority: details.priority,
            notes: details.notes,
            status: "aberto",
          });

          if (insertErr) {
            if (insertErr.code === "23505") {
              // Record exists for today — update it with richer extracted data
              log("📋 Record exists today — updating with richer AI data...");
              const today = new Date().toISOString().split("T")[0];
              const { error: updateErr } = await sb
                .from("atendimentos")
                .update({
                  client_name: details.client_name || conv.client_name || null,
                  condominium_name: details.condominium_name || null,
                  problem_type: details.problem_type,
                  description: details.description,
                  priority: details.priority,
                  notes: details.notes,
                })
                .eq("company_id", conv.company_id)
                .eq("phone", cleanPhone)
                .gte("created_at", today + "T00:00:00")
                .lte("created_at", today + "T23:59:59");

              if (updateErr) {
                log("❌ Update failed:", updateErr.message);
                failed++;
              } else {
                log("✅ Atendimento updated with full AI data!");
                processed++;
              }
            } else {
              log("❌ Insert failed:", insertErr.message);
              failed++;
            }
          } else {
            log("✅ Atendimento inserted with full AI data!");
            processed++;
          }
        } else {
          log("✅ Atendimento upserted with full AI data!");
          processed++;
        }

        // Reset conversation intent so it won't be processed again
        await sb
          .from("whatsapp_conversations")
          .update({ current_intent: null })
          .eq("id", conv.id);

        log(`📋 Conversation ${conv.id} intent reset to null`);
      } catch (convProcessErr: any) {
        log(`❌ Error processing conversation ${conv.id}:`, convProcessErr.message);
        failed++;
        // Reset intent to avoid infinite loop on persistent errors
        try {
          await sb.from("whatsapp_conversations")
            .update({ current_intent: null })
            .eq("id", conv.id);
        } catch {}
      }
    }

    log(`📋 Done. Processed: ${processed} | Failed: ${failed}`);

    return new Response(
      JSON.stringify({ ok: true, processed, failed, total: conversations.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    log("❌ Fatal error:", err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
