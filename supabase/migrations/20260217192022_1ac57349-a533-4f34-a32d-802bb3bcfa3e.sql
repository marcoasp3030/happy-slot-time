
ALTER TABLE public.whatsapp_agent_settings
  ADD COLUMN IF NOT EXISTS ai_model text DEFAULT 'google/gemini-2.5-flash';
