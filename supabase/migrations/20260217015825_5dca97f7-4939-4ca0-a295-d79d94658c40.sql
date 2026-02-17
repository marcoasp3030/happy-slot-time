
-- Add generate_meet_link toggle to company_settings
ALTER TABLE public.company_settings
ADD COLUMN generate_meet_link boolean NOT NULL DEFAULT false;

-- Add meet_link to appointments to store the generated link
ALTER TABLE public.appointments
ADD COLUMN meet_link text NULL;
