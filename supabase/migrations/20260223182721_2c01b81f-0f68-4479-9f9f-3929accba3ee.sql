-- Fix client-photos storage policies: restrict to company-scoped paths

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Company members can view client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete client photos" ON storage.objects;

-- Create company-scoped policies using path prefix
CREATE POLICY "Company members can view own client photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'client-photos' AND
    (storage.foldername(name))[1] = get_user_company_id()::text
  );

CREATE POLICY "Company members can upload own client photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'client-photos' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = get_user_company_id()::text
  );

CREATE POLICY "Company members can update own client photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'client-photos' AND
    (storage.foldername(name))[1] = get_user_company_id()::text
  );

CREATE POLICY "Company members can delete own client photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'client-photos' AND
    (storage.foldername(name))[1] = get_user_company_id()::text
  );