
-- Fix: Change public insert policies to PERMISSIVE so anonymous users can book

-- Appointments: drop restrictive and recreate as permissive
DROP POLICY IF EXISTS "Public can create appointments" ON public.appointments;
CREATE POLICY "Public can create appointments"
ON public.appointments
FOR INSERT
WITH CHECK (
  client_name IS NOT NULL AND client_name <> '' 
  AND client_phone IS NOT NULL AND client_phone <> '' 
  AND company_id IS NOT NULL
);

-- Anamnesis responses: drop restrictive and recreate as permissive
DROP POLICY IF EXISTS "Public can create anamnesis responses" ON public.anamnesis_responses;
CREATE POLICY "Public can create anamnesis responses"
ON public.anamnesis_responses
FOR INSERT
WITH CHECK (
  client_name IS NOT NULL AND client_phone IS NOT NULL
);
