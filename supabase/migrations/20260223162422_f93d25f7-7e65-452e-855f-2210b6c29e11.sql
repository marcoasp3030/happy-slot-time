-- Add extra_messages column to support sequential messages in campaigns
ALTER TABLE public.mass_campaigns
ADD COLUMN extra_messages jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.mass_campaigns.extra_messages IS 'Array of additional messages [{text, media_files}] sent sequentially after the primary message';