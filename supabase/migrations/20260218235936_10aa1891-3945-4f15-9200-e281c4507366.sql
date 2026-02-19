
-- Add instance_id to whatsapp_conversations to isolate each WhatsApp number's conversations
ALTER TABLE public.whatsapp_conversations 
  ADD COLUMN IF NOT EXISTS instance_id uuid NULL REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- Create index for fast lookup by (company_id, phone, instance_id, status)
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_instance 
  ON public.whatsapp_conversations (company_id, phone, instance_id, status);
