
-- Add media_url column to mass_campaigns for image/audio/file attachments
ALTER TABLE public.mass_campaigns ADD COLUMN media_url text NULL;
ALTER TABLE public.mass_campaigns ADD COLUMN media_type text NULL;
-- media_type values: null (text only), 'image', 'audio', 'document'
