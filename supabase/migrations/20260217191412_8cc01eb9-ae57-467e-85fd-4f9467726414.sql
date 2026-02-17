
ALTER TABLE public.whatsapp_agent_settings
  ADD COLUMN IF NOT EXISTS collect_client_name boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS collect_client_phone boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS collect_client_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS collect_company_name boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS collect_segment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS collect_region boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS collect_area boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_collect_fields jsonb DEFAULT '[]'::jsonb;
