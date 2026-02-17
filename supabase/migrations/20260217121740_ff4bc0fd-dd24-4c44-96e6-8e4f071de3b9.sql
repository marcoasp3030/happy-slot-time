
-- Consent logs table to track LGPD consent
CREATE TABLE public.consent_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  consent_type text NOT NULL DEFAULT 'booking',
  ip_address text,
  user_agent text,
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  policy_version text DEFAULT '1.0'
);

ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view consent_logs"
  ON public.consent_logs FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY "Public can create consent_logs"
  ON public.consent_logs FOR INSERT
  WITH CHECK (client_name IS NOT NULL AND client_phone IS NOT NULL);

CREATE POLICY "Super admins can view all consent_logs"
  ON public.consent_logs FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Add privacy_policy_text to company_settings
ALTER TABLE public.company_settings
  ADD COLUMN privacy_policy_text text DEFAULT 'Ao utilizar nossos serviços, você concorda com a coleta e o tratamento dos seus dados pessoais (nome, telefone e informações de saúde/estéticas) exclusivamente para fins de agendamento, atendimento e acompanhamento clínico. Seus dados são armazenados com segurança e não são compartilhados com terceiros. Você pode solicitar a exclusão dos seus dados a qualquer momento entrando em contato com o estabelecimento. Em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).';

-- Index for fast lookups by phone
CREATE INDEX idx_consent_logs_phone ON public.consent_logs (company_id, client_phone);
