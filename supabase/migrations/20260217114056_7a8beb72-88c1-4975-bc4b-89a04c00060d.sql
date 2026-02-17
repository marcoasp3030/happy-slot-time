
-- Create anamnesis_types table to group templates into named types
CREATE TABLE public.anamnesis_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.anamnesis_types ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company members can manage anamnesis_types"
ON public.anamnesis_types FOR ALL
USING (company_id = get_user_company_id());

CREATE POLICY "Public can view active anamnesis types"
ON public.anamnesis_types FOR SELECT
USING (active = true);

-- Add anamnesis_type_id to anamnesis_templates (replace service_id as grouping)
ALTER TABLE public.anamnesis_templates
ADD COLUMN anamnesis_type_id UUID REFERENCES public.anamnesis_types(id) ON DELETE CASCADE;

-- Add anamnesis_type_id to services (which anamnesis type this service uses)
ALTER TABLE public.services
ADD COLUMN anamnesis_type_id UUID REFERENCES public.anamnesis_types(id) ON DELETE SET NULL;

-- Add anamnesis_type_id to anamnesis_responses (which type was used)
ALTER TABLE public.anamnesis_responses
ADD COLUMN anamnesis_type_id UUID REFERENCES public.anamnesis_types(id) ON DELETE SET NULL;
