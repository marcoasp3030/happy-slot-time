ALTER TABLE public.whatsapp_agent_settings
  ADD COLUMN IF NOT EXISTS can_read_media boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_vision_model text DEFAULT 'google/gemini-2.5-flash';