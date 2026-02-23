
-- Create storage bucket for campaign media files
INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-media', 'campaign-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to campaign-media bucket
CREATE POLICY "Authenticated users can upload campaign media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'campaign-media' AND auth.role() = 'authenticated');

-- Allow public read access
CREATE POLICY "Public can view campaign media"
ON storage.objects FOR SELECT
USING (bucket_id = 'campaign-media');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete campaign media"
ON storage.objects FOR DELETE
USING (bucket_id = 'campaign-media' AND auth.role() = 'authenticated');

-- Add media_files column (jsonb array) to mass_campaigns for multiple file support
ALTER TABLE public.mass_campaigns ADD COLUMN IF NOT EXISTS media_files jsonb DEFAULT '[]'::jsonb;
