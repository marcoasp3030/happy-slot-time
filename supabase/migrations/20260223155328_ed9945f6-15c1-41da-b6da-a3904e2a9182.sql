
-- Contact lists for mass campaigns
CREATE TABLE public.mass_contact_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.mass_contact_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage mass_contact_lists"
  ON public.mass_contact_lists FOR ALL
  USING (company_id = get_user_company_id());

-- Contacts belonging to lists
CREATE TABLE public.mass_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  list_id UUID REFERENCES public.mass_contact_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.mass_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage mass_contacts"
  ON public.mass_contacts FOR ALL
  USING (company_id = get_user_company_id());

-- Index for faster lookups
CREATE INDEX idx_mass_contacts_company ON public.mass_contacts(company_id);
CREATE INDEX idx_mass_contacts_list ON public.mass_contacts(list_id);
CREATE INDEX idx_mass_contacts_tags ON public.mass_contacts USING GIN(tags);
CREATE INDEX idx_mass_contacts_phone ON public.mass_contacts(company_id, phone);

-- Trigger for updated_at
CREATE TRIGGER update_mass_contact_lists_updated_at
  BEFORE UPDATE ON public.mass_contact_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mass_contacts_updated_at
  BEFORE UPDATE ON public.mass_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
