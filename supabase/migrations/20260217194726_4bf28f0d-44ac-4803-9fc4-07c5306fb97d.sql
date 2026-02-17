
-- Tabela de preços por modelo
CREATE TABLE public.llm_model_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  input_cost_per_1k numeric NOT NULL DEFAULT 0,
  output_cost_per_1k numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, model)
);

ALTER TABLE public.llm_model_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage llm_model_pricing"
ON public.llm_model_pricing FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated can view llm_model_pricing"
ON public.llm_model_pricing FOR SELECT
TO authenticated
USING (true);

-- Tabela de logs de uso
CREATE TABLE public.llm_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  cost_per_1k numeric,
  total_cost numeric NOT NULL DEFAULT 0,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.llm_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view own llm_usage_logs"
ON public.llm_usage_logs FOR SELECT
USING (company_id = get_user_company_id());

CREATE POLICY "Super admins can view all llm_usage_logs"
ON public.llm_usage_logs FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Índices para performance
CREATE INDEX idx_llm_usage_logs_company_id ON public.llm_usage_logs(company_id);
CREATE INDEX idx_llm_usage_logs_created_at ON public.llm_usage_logs(created_at);
CREATE INDEX idx_llm_usage_logs_provider_model ON public.llm_usage_logs(provider, model);

-- Tabela de limites mensais por tenant
CREATE TABLE public.llm_usage_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  monthly_token_limit integer NOT NULL DEFAULT 1000000,
  alert_50_sent boolean NOT NULL DEFAULT false,
  alert_80_sent boolean NOT NULL DEFAULT false,
  alert_100_sent boolean NOT NULL DEFAULT false,
  current_month text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.llm_usage_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage own llm_usage_limits"
ON public.llm_usage_limits FOR ALL
USING (company_id = get_user_company_id());

CREATE POLICY "Super admins can manage all llm_usage_limits"
ON public.llm_usage_limits FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Inserir preços padrão dos modelos
INSERT INTO public.llm_model_pricing (provider, model, input_cost_per_1k, output_cost_per_1k) VALUES
  ('openai', 'gpt-4o', 0.005, 0.015),
  ('openai', 'gpt-4o-mini', 0.00015, 0.0006),
  ('openai', 'gpt-4-turbo', 0.01, 0.03),
  ('google', 'gemini-2.5-flash', 0.00015, 0.0006),
  ('google', 'gemini-2.5-pro', 0.00125, 0.005),
  ('google', 'gemini-2.0-flash', 0.0001, 0.0004),
  ('lovable', 'google/gemini-2.5-flash', 0.00015, 0.0006),
  ('lovable', 'google/gemini-2.5-pro', 0.00125, 0.005);

-- Trigger para updated_at
CREATE TRIGGER update_llm_model_pricing_updated_at
BEFORE UPDATE ON public.llm_model_pricing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_llm_usage_limits_updated_at
BEFORE UPDATE ON public.llm_usage_limits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
