
-- Mass messaging campaigns
CREATE TABLE public.mass_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  message_text TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text', -- text, button, list
  buttons JSONB DEFAULT '[]'::jsonb,
  list_sections JSONB DEFAULT '[]'::jsonb,
  footer_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, processing, completed, cancelled
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  delay_seconds INTEGER NOT NULL DEFAULT 10,
  total_contacts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual contacts in a campaign
CREATE TABLE public.mass_campaign_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.mass_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_mass_campaigns_company ON public.mass_campaigns(company_id);
CREATE INDEX idx_mass_campaigns_status ON public.mass_campaigns(status);
CREATE INDEX idx_mass_campaign_contacts_campaign ON public.mass_campaign_contacts(campaign_id);
CREATE INDEX idx_mass_campaign_contacts_status ON public.mass_campaign_contacts(campaign_id, status);

-- RLS
ALTER TABLE public.mass_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_campaign_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage mass_campaigns"
ON public.mass_campaigns FOR ALL
USING (company_id = get_user_company_id());

CREATE POLICY "Company members can manage mass_campaign_contacts"
ON public.mass_campaign_contacts FOR ALL
USING (campaign_id IN (
  SELECT id FROM public.mass_campaigns WHERE company_id = get_user_company_id()
));

-- Updated_at trigger
CREATE TRIGGER mass_campaigns_updated_at
  BEFORE UPDATE ON public.mass_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
