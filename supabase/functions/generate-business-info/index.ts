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

    // Fetch all relevant company data in parallel
    const [companyRes, servicesRes, staffRes, hoursRes, settingsRes] = await Promise.all([
      supabase.from("companies").select("name, address, phone").eq("id", companyId).single(),
      supabase.from("services").select("name, description, price, duration").eq("company_id", companyId).eq("active", true),
      supabase.from("staff").select("name").eq("company_id", companyId).eq("active", true),
      supabase.from("business_hours").select("day_of_week, open_time, close_time, is_open").eq("company_id", companyId).order("day_of_week"),
      supabase.from("company_settings").select("slot_interval, min_advance_hours").eq("company_id", companyId).single(),
    ]);

    const company = companyRes.data;
    const services = servicesRes.data || [];
    const staff = staffRes.data || [];
    const hours = hoursRes.data || [];
    const companySettings = settingsRes.data;

    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const hoursText = hours.map((h: any) => 
      `${dayNames[h.day_of_week]}: ${h.is_open ? `${h.open_time} - ${h.close_time}` : "Fechado"}`
    ).join("\n");

    const servicesText = services.map((s: any) => 
      `- ${s.name}${s.price ? ` (R$ ${Number(s.price).toFixed(2)})` : ""}${s.duration ? ` - ${s.duration}min` : ""}${s.description ? `: ${s.description}` : ""}`
    ).join("\n");

    const staffText = staff.map((s: any) => s.name).join(", ");

    const prompt = `Você é um assistente que gera textos informativos para estabelecimentos. Com base nos dados abaixo, gere um texto curto e objetivo (máximo 4-5 linhas) com as informações mais úteis para um cliente que está conversando pelo WhatsApp. O texto deve ser natural, informativo e incluir detalhes como formas de pagamento sugeridas, facilidades do local, etc. NÃO repita dados que já são compartilhados separadamente (endereço, telefone, horários, serviços, profissionais). Foque em informações COMPLEMENTARES e úteis.

Dados do estabelecimento:
Nome: ${company?.name || "Não informado"}
Endereço: ${company?.address || "Não informado"}
Telefone: ${company?.phone || "Não informado"}

Horários:
${hoursText || "Não configurado"}

Serviços:
${servicesText || "Nenhum serviço cadastrado"}

Profissionais: ${staffText || "Nenhum profissional cadastrado"}

Antecedência mínima para agendamento: ${companySettings?.min_advance_hours || 2} horas
Intervalo entre horários: ${companySettings?.slot_interval || 30} minutos

Gere APENAS o texto informativo, sem título, sem aspas, sem formatação markdown.`;

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
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para geração com IA." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    console.error("generate-business-info error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
