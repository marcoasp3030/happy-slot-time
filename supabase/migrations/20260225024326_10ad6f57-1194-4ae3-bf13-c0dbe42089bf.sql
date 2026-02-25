
-- WhatsApp settings per company
CREATE TABLE public.whatsapp_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  base_url TEXT,
  instance_id TEXT,
  token TEXT,
  admin_token TEXT,
  from_number TEXT,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_settings_company_id_key UNIQUE (company_id)
);

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company whatsapp_settings"
  ON public.whatsapp_settings FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can insert own company whatsapp_settings"
  ON public.whatsapp_settings FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Users can update own company whatsapp_settings"
  ON public.whatsapp_settings FOR UPDATE
  USING (company_id = public.get_user_company_id());

-- Service role needs full access for edge functions
CREATE POLICY "Service role full access whatsapp_settings"
  ON public.whatsapp_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- WhatsApp instances (multi-number support)
CREATE TABLE public.whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  instance_id TEXT,
  token TEXT,
  label TEXT NOT NULL DEFAULT 'WhatsApp',
  status TEXT NOT NULL DEFAULT 'disconnected',
  phone_number TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company whatsapp_instances"
  ON public.whatsapp_instances FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can manage own company whatsapp_instances"
  ON public.whatsapp_instances FOR ALL
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Service role full access whatsapp_instances"
  ON public.whatsapp_instances FOR ALL
  USING (true)
  WITH CHECK (true);

-- Message templates
CREATE TABLE public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  template TEXT NOT NULL,
  send_notification BOOLEAN DEFAULT true,
  buttons JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company message_templates"
  ON public.message_templates FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can manage own company message_templates"
  ON public.message_templates FOR ALL
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Service role full access message_templates"
  ON public.message_templates FOR ALL
  USING (true)
  WITH CHECK (true);

-- Notification rules
CREATE TABLE public.notification_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  minutes_before INTEGER NOT NULL DEFAULT 60,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company notification_rules"
  ON public.notification_rules FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can manage own company notification_rules"
  ON public.notification_rules FOR ALL
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Service role full access notification_rules"
  ON public.notification_rules FOR ALL
  USING (true)
  WITH CHECK (true);

-- Contact tags
CREATE TABLE public.contact_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  tag TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company contact_tags"
  ON public.contact_tags FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Users can manage own company contact_tags"
  ON public.contact_tags FOR ALL
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Service role full access contact_tags"
  ON public.contact_tags FOR ALL
  USING (true)
  WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_instances_updated_at
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
