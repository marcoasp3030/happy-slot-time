ALTER TABLE public.whatsapp_agent_settings 
ADD COLUMN IF NOT EXISTS message_delay_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS message_delay_seconds integer DEFAULT 8;