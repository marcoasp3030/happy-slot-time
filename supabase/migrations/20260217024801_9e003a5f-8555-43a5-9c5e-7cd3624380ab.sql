
-- Add service-level flags for anamnesis and sessions
ALTER TABLE public.services
  ADD COLUMN requires_anamnesis boolean NOT NULL DEFAULT false,
  ADD COLUMN requires_sessions boolean NOT NULL DEFAULT false;

-- Anamnesis templates: custom questions per service
CREATE TABLE public.anamnesis_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text', -- text, textarea, select, checkbox, number
  field_options jsonb, -- for select/checkbox: ["option1","option2"]
  sort_order integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.anamnesis_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage anamnesis_templates"
  ON public.anamnesis_templates FOR ALL
  USING (company_id = get_user_company_id());

CREATE POLICY "Public can view active anamnesis templates"
  ON public.anamnesis_templates FOR SELECT
  USING (active = true);

-- Anamnesis responses: filled per client per appointment
CREATE TABLE public.anamnesis_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  responses jsonb NOT NULL DEFAULT '{}', -- { "template_id": "answer", ... }
  notes text,
  filled_by text NOT NULL DEFAULT 'client', -- client | professional
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.anamnesis_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage anamnesis_responses"
  ON public.anamnesis_responses FOR ALL
  USING (company_id = get_user_company_id());

CREATE POLICY "Public can create anamnesis responses"
  ON public.anamnesis_responses FOR INSERT
  WITH CHECK (client_name IS NOT NULL AND client_phone IS NOT NULL);

-- Session packages: tracks bundles of sessions
CREATE TABLE public.session_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  total_sessions integer, -- NULL = unlimited
  notes text,
  status text NOT NULL DEFAULT 'active', -- active, completed, canceled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage session_packages"
  ON public.session_packages FOR ALL
  USING (company_id = get_user_company_id());

-- Individual sessions within a package
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.session_packages(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  session_number integer NOT NULL DEFAULT 1,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  evolution text, -- professional notes on progress
  status text NOT NULL DEFAULT 'completed', -- completed, missed, canceled
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage sessions"
  ON public.sessions FOR ALL
  USING (company_id = get_user_company_id());

-- Photo attachments: linked to anamnesis or sessions
CREATE TABLE public.client_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  anamnesis_response_id uuid REFERENCES public.anamnesis_responses(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.session_packages(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  photo_type text DEFAULT 'general', -- before, after, progress, general
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage client_photos"
  ON public.client_photos FOR ALL
  USING (company_id = get_user_company_id());

-- Storage bucket for client photos
INSERT INTO storage.buckets (id, name, public) VALUES ('client-photos', 'client-photos', false);

CREATE POLICY "Company members can view client photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'client-photos');

CREATE POLICY "Authenticated users can upload client photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'client-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update client photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'client-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete client photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'client-photos' AND auth.role() = 'authenticated');
