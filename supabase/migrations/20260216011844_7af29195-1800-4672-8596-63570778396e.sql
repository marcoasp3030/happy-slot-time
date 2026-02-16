
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies (tenants)
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscriptions
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','past_due','canceled','expired')),
  trial_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Services
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 30,
  price NUMERIC(10,2),
  description TEXT,
  color TEXT DEFAULT '#10b981',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff / Professionals
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  photo_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff-Service relationship
CREATE TABLE public.staff_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(staff_id, service_id)
);

-- Business hours
CREATE TABLE public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL DEFAULT '09:00',
  close_time TIME NOT NULL DEFAULT '18:00',
  is_open BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(company_id, day_of_week)
);

-- Time blocks (holidays, breaks)
CREATE TABLE public.time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Appointments
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','canceled','rescheduled','completed','no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WhatsApp settings (UAZAPI)
CREATE TABLE public.whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  base_url TEXT,
  instance_id TEXT,
  token TEXT,
  from_number TEXT,
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Message templates
CREATE TABLE public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('confirmation','reminder','cancellation','reschedule','confirmation_request')),
  template TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notification rules
CREATE TABLE public.notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('reminder_1','reminder_2')),
  minutes_before INTEGER NOT NULL DEFAULT 120,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Public page settings
CREATE TABLE public.public_page_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  primary_color TEXT DEFAULT '#10b981',
  secondary_color TEXT DEFAULT '#0f172a',
  background_color TEXT DEFAULT '#ffffff',
  font_style TEXT DEFAULT 'modern',
  button_style TEXT DEFAULT 'rounded',
  banner_url TEXT,
  title TEXT DEFAULT 'Agende seu horário',
  subtitle TEXT,
  welcome_message TEXT,
  show_address BOOLEAN DEFAULT true,
  show_map BOOLEAN DEFAULT false,
  show_services_cards BOOLEAN DEFAULT true,
  cancellation_policy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WhatsApp logs
CREATE TABLE public.whatsapp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  phone TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company settings
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  slot_interval INTEGER NOT NULL DEFAULT 30,
  min_advance_hours INTEGER NOT NULL DEFAULT 2,
  max_capacity_per_slot INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_page_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- RLS Policies for companies
CREATE POLICY "Users can view own company" ON public.companies
  FOR SELECT USING (id = public.get_user_company_id());
CREATE POLICY "Users can update own company" ON public.companies
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Authenticated users can create company" ON public.companies
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- RLS for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS for subscriptions
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can update own subscription" ON public.subscriptions
  FOR UPDATE USING (company_id = public.get_user_company_id());

-- Company-scoped policies (same pattern for all tenant tables)
CREATE POLICY "Company members can view services" ON public.services
  FOR SELECT USING (company_id = public.get_user_company_id());
CREATE POLICY "Company members can manage services" ON public.services
  FOR ALL USING (company_id = public.get_user_company_id());

-- Public access to services for booking page
CREATE POLICY "Public can view active services" ON public.services
  FOR SELECT USING (active = true);

CREATE POLICY "Company members can view staff" ON public.staff
  FOR SELECT USING (company_id = public.get_user_company_id());
CREATE POLICY "Company members can manage staff" ON public.staff
  FOR ALL USING (company_id = public.get_user_company_id());
CREATE POLICY "Public can view active staff" ON public.staff
  FOR SELECT USING (active = true);

CREATE POLICY "Company members can manage staff_services" ON public.staff_services
  FOR ALL USING (
    staff_id IN (SELECT id FROM public.staff WHERE company_id = public.get_user_company_id())
  );
CREATE POLICY "Public can view staff_services" ON public.staff_services
  FOR SELECT USING (true);

CREATE POLICY "Company members can manage business_hours" ON public.business_hours
  FOR ALL USING (company_id = public.get_user_company_id());
CREATE POLICY "Public can view business_hours" ON public.business_hours
  FOR SELECT USING (true);

CREATE POLICY "Company members can manage time_blocks" ON public.time_blocks
  FOR ALL USING (company_id = public.get_user_company_id());

CREATE POLICY "Company members can manage appointments" ON public.appointments
  FOR ALL USING (company_id = public.get_user_company_id());
-- Public can create appointments (booking page)
CREATE POLICY "Public can create appointments" ON public.appointments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Company members can manage whatsapp_settings" ON public.whatsapp_settings
  FOR ALL USING (company_id = public.get_user_company_id());

CREATE POLICY "Company members can manage message_templates" ON public.message_templates
  FOR ALL USING (company_id = public.get_user_company_id());

CREATE POLICY "Company members can manage notification_rules" ON public.notification_rules
  FOR ALL USING (company_id = public.get_user_company_id());

CREATE POLICY "Company members can manage public_page_settings" ON public.public_page_settings
  FOR ALL USING (company_id = public.get_user_company_id());
CREATE POLICY "Public can view public_page_settings" ON public.public_page_settings
  FOR SELECT USING (true);

CREATE POLICY "Company members can view whatsapp_logs" ON public.whatsapp_logs
  FOR SELECT USING (company_id = public.get_user_company_id());

CREATE POLICY "Company members can manage company_settings" ON public.company_settings
  FOR ALL USING (company_id = public.get_user_company_id());
CREATE POLICY "Public can view company_settings" ON public.company_settings
  FOR SELECT USING (true);

-- Public access to companies for booking page (by slug)
CREATE POLICY "Public can view companies by slug" ON public.companies
  FOR SELECT USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + company on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_company_id UUID;
BEGIN
  -- Create company
  INSERT INTO public.companies (owner_id, name, slug)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'company_name', 'Minha Empresa'), 
          LOWER(REPLACE(COALESCE(NEW.raw_user_meta_data->>'company_name', 'empresa-' || substr(NEW.id::text, 1, 8)), ' ', '-')))
  RETURNING id INTO new_company_id;
  
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name, company_id, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), new_company_id, 'admin');
  
  -- Create subscription (trial)
  INSERT INTO public.subscriptions (company_id) VALUES (new_company_id);
  
  -- Create default business hours (Mon-Sat)
  INSERT INTO public.business_hours (company_id, day_of_week, open_time, close_time, is_open)
  VALUES 
    (new_company_id, 1, '09:00', '18:00', true),
    (new_company_id, 2, '09:00', '18:00', true),
    (new_company_id, 3, '09:00', '18:00', true),
    (new_company_id, 4, '09:00', '18:00', true),
    (new_company_id, 5, '09:00', '18:00', true),
    (new_company_id, 6, '09:00', '13:00', true),
    (new_company_id, 0, '00:00', '00:00', false);
  
  -- Create default company settings
  INSERT INTO public.company_settings (company_id) VALUES (new_company_id);
  
  -- Create default public page settings
  INSERT INTO public.public_page_settings (company_id) VALUES (new_company_id);
  
  -- Create default message templates
  INSERT INTO public.message_templates (company_id, type, template) VALUES
    (new_company_id, 'confirmation', 'Olá {{cliente_nome}}! Seu agendamento para {{servico}} em {{data}} às {{hora}} foi confirmado. {{empresa_nome}}'),
    (new_company_id, 'reminder', 'Lembrete: Você tem um agendamento para {{servico}} amanhã às {{hora}}. {{empresa_nome}}'),
    (new_company_id, 'cancellation', 'Seu agendamento para {{servico}} em {{data}} às {{hora}} foi cancelado. {{empresa_nome}}');
  
  -- Create default notification rules
  INSERT INTO public.notification_rules (company_id, type, minutes_before) VALUES
    (new_company_id, 'reminder_1', 1440),
    (new_company_id, 'reminder_2', 120);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
