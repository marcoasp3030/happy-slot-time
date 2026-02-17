
ALTER TABLE public.whatsapp_agent_settings
ADD COLUMN can_send_payment_link boolean DEFAULT false,
ADD COLUMN payment_link_url text,
ADD COLUMN can_send_pix boolean DEFAULT false,
ADD COLUMN pix_key text,
ADD COLUMN pix_name text,
ADD COLUMN pix_instructions text;
