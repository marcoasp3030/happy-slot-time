
-- Add buttons configuration to message_templates
ALTER TABLE public.message_templates
ADD COLUMN buttons jsonb DEFAULT '[]'::jsonb;

-- Add send_notification flag so merchant can toggle each notification type
ALTER TABLE public.message_templates
ADD COLUMN send_notification boolean NOT NULL DEFAULT true;
