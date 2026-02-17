
-- 1. Add delivery status tracking to whatsapp_messages
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'sent',
ADD COLUMN IF NOT EXISTS wa_message_id text;

-- Index for fast lookup by wa_message_id (used for status updates)
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_msg_id ON public.whatsapp_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

-- 2. Add auto-reaction settings to whatsapp_agent_settings
ALTER TABLE public.whatsapp_agent_settings
ADD COLUMN IF NOT EXISTS auto_react_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS react_on_confirm text DEFAULT '✅',
ADD COLUMN IF NOT EXISTS react_on_cancel text DEFAULT '😢',
ADD COLUMN IF NOT EXISTS react_on_thanks text DEFAULT '❤️',
ADD COLUMN IF NOT EXISTS react_on_booking text DEFAULT '📅',
ADD COLUMN IF NOT EXISTS react_on_greeting text DEFAULT '👋',
ADD COLUMN IF NOT EXISTS reaction_triggers jsonb DEFAULT '[{"emoji":"👍","action":"confirm_appointment","label":"Confirmar agendamento"},{"emoji":"❌","action":"cancel_appointment","label":"Cancelar agendamento"}]'::jsonb;
