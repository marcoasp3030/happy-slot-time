
-- Add AI inference control parameters to whatsapp_agent_settings
ALTER TABLE public.whatsapp_agent_settings
  ADD COLUMN IF NOT EXISTS temperature numeric DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS top_p numeric DEFAULT 0.9,
  ADD COLUMN IF NOT EXISTS frequency_penalty numeric DEFAULT 0.4,
  ADD COLUMN IF NOT EXISTS presence_penalty numeric DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS max_tokens integer DEFAULT 500;
