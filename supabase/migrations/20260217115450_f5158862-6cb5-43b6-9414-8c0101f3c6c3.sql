
-- Add image_url column to services
ALTER TABLE public.services ADD COLUMN image_url text DEFAULT NULL;

-- Create service-images bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('service-images', 'service-images', true);

-- Allow authenticated users to upload service images
CREATE POLICY "Authenticated users can upload service images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'service-images' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their service images
CREATE POLICY "Authenticated users can update service images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'service-images' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete service images
CREATE POLICY "Authenticated users can delete service images"
ON storage.objects FOR DELETE
USING (bucket_id = 'service-images' AND auth.role() = 'authenticated');

-- Allow public to view service images
CREATE POLICY "Public can view service images"
ON storage.objects FOR SELECT
USING (bucket_id = 'service-images');
