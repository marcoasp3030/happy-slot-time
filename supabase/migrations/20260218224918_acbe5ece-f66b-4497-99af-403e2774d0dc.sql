
-- Create plans table for super admin to manage subscription plans
CREATE TABLE public.plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC DEFAULT 0,
  max_whatsapp_instances INTEGER NOT NULL DEFAULT 1,
  monthly_token_limit INTEGER NOT NULL DEFAULT 1000000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Super admins can fully manage plans
CREATE POLICY "Super admins can manage plans"
  ON public.plans
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- All authenticated users can view active plans
CREATE POLICY "Authenticated users can view active plans"
  ON public.plans
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Add updated_at trigger
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add plan_id FK to subscriptions (optional link)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;

-- Seed some default plans
INSERT INTO public.plans (name, description, price, max_whatsapp_instances, monthly_token_limit, sort_order, features)
VALUES
  ('Starter', 'Plano inicial para pequenos negócios', 49.90, 1, 500000, 1, '["1 número WhatsApp", "Agendamentos ilimitados", "Agente de IA básico"]'),
  ('Pro', 'Para negócios em crescimento', 99.90, 3, 2000000, 2, '["3 números WhatsApp", "Agendamentos ilimitados", "Agente de IA avançado", "Relatórios completos"]'),
  ('Enterprise', 'Para grandes operações', 199.90, 10, 10000000, 3, '["10 números WhatsApp", "Agendamentos ilimitados", "Agente de IA premium", "Relatórios avançados", "Suporte prioritário"]');
