
-- Fix the permissive INSERT policy on appointments to require at least company_id and client info
DROP POLICY "Public can create appointments" ON public.appointments;
CREATE POLICY "Public can create appointments" ON public.appointments
  FOR INSERT WITH CHECK (
    client_name IS NOT NULL AND client_name <> '' AND
    client_phone IS NOT NULL AND client_phone <> '' AND
    company_id IS NOT NULL
  );
