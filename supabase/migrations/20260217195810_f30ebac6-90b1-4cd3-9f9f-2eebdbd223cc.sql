
-- Add gemini_api_key to whatsapp_agent_settings
ALTER TABLE public.whatsapp_agent_settings
ADD COLUMN IF NOT EXISTS gemini_api_key text DEFAULT NULL;

-- Add preferred_provider to track which provider the tenant wants to use
ALTER TABLE public.whatsapp_agent_settings
ADD COLUMN IF NOT EXISTS preferred_provider text DEFAULT 'lovable';
