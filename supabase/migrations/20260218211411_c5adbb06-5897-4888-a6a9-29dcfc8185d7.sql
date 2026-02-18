
-- ===================================================
-- Multi-instance WhatsApp support
-- ===================================================

-- 1. Create whatsapp_instances table for multi-instance support
CREATE TABLE public.whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  instance_id TEXT,
  token TEXT,
  phone_number TEXT,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_instances_updated_at
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company members can manage whatsapp_instances"
  ON public.whatsapp_instances
  FOR ALL
  USING (company_id = get_user_company_id());

CREATE POLICY "Super admins can manage all whatsapp_instances"
  ON public.whatsapp_instances
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 2. Add max_whatsapp_instances to subscriptions table
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS max_whatsapp_instances INTEGER NOT NULL DEFAULT 1;

-- 3. Add plan_name to subscriptions for display
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_name TEXT;

-- 4. Index for performance
CREATE INDEX idx_whatsapp_instances_company_id ON public.whatsapp_instances(company_id);
