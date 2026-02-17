import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.company_id) throw new Error("Company not found");

    const companyId = profile.company_id;
    const { action, current_prompt } = await req.json();

    // Fetch company data
    const [companyRes, servicesRes, staffRes, hoursRes] = await Promise.all([
      supabase.from("companies").select("name, address, phone").eq("id", companyId).single(),
      supabase.from("services").select("name, description, price, duration").eq("company_id", companyId).eq("active", true),
      supabase.from("staff").select("name").eq("company_id", companyId).eq("active", true),
      supabase.from("business_hours").select("day_of_week, open_time, close_time, is_open").eq("company_id", companyId).order("day_of_week"),
    ]);

    const company = companyRes.data;
    const services = servicesRes.data || [];
    const staff = staffRes.data || [];
    const hours = hoursRes.data || [];

    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const hoursText = hours.map((h: any) =>
      `${dayNames[h.day_of_week]}: ${h.is_open ? `${h.open_time} - ${h.close_time}` : "Fechado"}`
    ).join(", ");
    const servicesText = services.map((s: any) => s.name).join(", ");
    const staffText = staff.map((s: any) => s.name).join(", ");

    let prompt: string;

    if (action === "generate") {
      prompt = `Você é um especialista em criar prompts para agentes de atendimento por WhatsApp. Crie um prompt personalizado para o agente de IA do estabelecimento "${company?.name || 'Minha Empresa'}".

Dados do negócio:
- Nome: ${company?.name || "Não informado"}
- Endereço: ${company?.address || "Não informado"}
- Telefone: ${company?.phone || "Não informado"}
- Serviços: ${servicesText || "Não cadastrados"}
- Profissionais: ${staffText || "Não cadastrados"}
- Horários: ${hoursText || "Não configurados"}

O prompt deve:
1. Definir a persona do agente como assistente do "${company?.name}"
2. Estabelecer tom de voz profissional mas acolhedor
3. Incluir regras de atendimento relevantes ao tipo de negócio
4. Instruir sobre como lidar com dúvidas fora do escopo
5. Ser conciso (máximo 10-12 linhas)

Gere APENAS o texto do prompt, sem título, aspas ou formatação markdown.`;
    } else if (action === "improve") {
      if (!current_prompt?.trim()) {
        return new Response(JSON.stringify({ error: "Nenhum prompt para melhorar. Escreva um prompt primeiro ou use 'Gerar com IA'." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      prompt = `Você é um especialista em otimizar prompts para agentes de atendimento por WhatsApp. Melhore o prompt abaixo para o agente de IA do estabelecimento "${company?.name || 'Minha Empresa'}".

Prompt atual:
"""
${current_prompt}
"""

Dados do negócio (para contexto):
- Nome: ${company?.name || "Não informado"}
- Serviços: ${servicesText || "Não cadastrados"}
- Profissionais: ${staffText || "Não cadastrados"}

Melhore o prompt:
1. Torne as instruções mais claras e específicas
2. Adicione regras que estejam faltando (lidar com reclamações, fora de escopo, etc.)
3. Melhore o tom e a estrutura
4. Mantenha a essência e intenção original
5. Mantenha conciso (máximo 12-15 linhas)

Gere APENAS o texto do prompt melhorado, sem título, aspas ou formatação markdown.`;
    } else {
      throw new Error("Invalid action. Use 'generate' or 'improve'.");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const generatedText = aiData.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ text: generatedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-agent-prompt error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
