
-- Automation flows table
CREATE TABLE public.automation_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  campaign_id UUID REFERENCES public.mass_campaigns(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Automation execution logs
CREATE TABLE public.automation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  trigger_type TEXT NOT NULL,
  trigger_value TEXT,
  node_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_result JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'executed',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contact tags table
CREATE TABLE public.contact_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  tag TEXT NOT NULL,
  flow_id UUID REFERENCES public.automation_flows(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.automation_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage automation_flows"
  ON public.automation_flows FOR ALL
  USING (company_id = get_user_company_id());

CREATE POLICY "Company members can manage automation_logs"
  ON public.automation_logs FOR ALL
  USING (company_id = get_user_company_id());

CREATE POLICY "Company members can manage contact_tags"
  ON public.contact_tags FOR ALL
  USING (company_id = get_user_company_id());

-- Updated_at trigger
CREATE TRIGGER update_automation_flows_updated_at
  BEFORE UPDATE ON public.automation_flows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
