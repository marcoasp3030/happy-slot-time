
-- Drop ALL restrictive policies and recreate as PERMISSIVE

-- ===== appointments =====
DROP POLICY IF EXISTS "Company members can manage appointments" ON public.appointments;
DROP POLICY IF EXISTS "Public can create appointments" ON public.appointments;

CREATE POLICY "Company members can manage appointments" ON public.appointments
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Public can create appointments" ON public.appointments
  FOR INSERT WITH CHECK (
    client_name IS NOT NULL AND client_name <> '' 
    AND client_phone IS NOT NULL AND client_phone <> '' 
    AND company_id IS NOT NULL
  );

-- ===== business_hours =====
DROP POLICY IF EXISTS "Company members can manage business_hours" ON public.business_hours;
DROP POLICY IF EXISTS "Public can view business_hours" ON public.business_hours;

CREATE POLICY "Company members can manage business_hours" ON public.business_hours
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Public can view business_hours" ON public.business_hours
  FOR SELECT USING (true);

-- ===== companies =====
DROP POLICY IF EXISTS "Authenticated users can create company" ON public.companies;
DROP POLICY IF EXISTS "Public can view companies by slug" ON public.companies;
DROP POLICY IF EXISTS "Users can update own company" ON public.companies;
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;

CREATE POLICY "Authenticated users can create company" ON public.companies
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Public can view companies by slug" ON public.companies
  FOR SELECT USING (true);

CREATE POLICY "Users can update own company" ON public.companies
  FOR UPDATE USING (owner_id = auth.uid());

-- ===== company_settings =====
DROP POLICY IF EXISTS "Company members can manage company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Public can view company_settings" ON public.company_settings;

CREATE POLICY "Company members can manage company_settings" ON public.company_settings
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Public can view company_settings" ON public.company_settings
  FOR SELECT USING (true);

-- ===== message_templates =====
DROP POLICY IF EXISTS "Company members can manage message_templates" ON public.message_templates;

CREATE POLICY "Company members can manage message_templates" ON public.message_templates
  FOR ALL USING (company_id = get_user_company_id());

-- ===== notification_rules =====
DROP POLICY IF EXISTS "Company members can manage notification_rules" ON public.notification_rules;

CREATE POLICY "Company members can manage notification_rules" ON public.notification_rules
  FOR ALL USING (company_id = get_user_company_id());

-- ===== profiles =====
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (user_id = auth.uid());

-- ===== public_page_settings =====
DROP POLICY IF EXISTS "Company members can manage public_page_settings" ON public.public_page_settings;
DROP POLICY IF EXISTS "Public can view public_page_settings" ON public.public_page_settings;

CREATE POLICY "Company members can manage public_page_settings" ON public.public_page_settings
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Public can view public_page_settings" ON public.public_page_settings
  FOR SELECT USING (true);

-- ===== services =====
DROP POLICY IF EXISTS "Company members can manage services" ON public.services;
DROP POLICY IF EXISTS "Company members can view services" ON public.services;
DROP POLICY IF EXISTS "Public can view active services" ON public.services;

CREATE POLICY "Company members can manage services" ON public.services
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Public can view active services" ON public.services
  FOR SELECT USING (active = true);

-- ===== staff =====
DROP POLICY IF EXISTS "Company members can manage staff" ON public.staff;
DROP POLICY IF EXISTS "Company members can view staff" ON public.staff;
DROP POLICY IF EXISTS "Public can view active staff" ON public.staff;

CREATE POLICY "Company members can manage staff" ON public.staff
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Public can view active staff" ON public.staff
  FOR SELECT USING (active = true);

-- ===== staff_services =====
DROP POLICY IF EXISTS "Company members can manage staff_services" ON public.staff_services;
DROP POLICY IF EXISTS "Public can view staff_services" ON public.staff_services;

CREATE POLICY "Company members can manage staff_services" ON public.staff_services
  FOR ALL USING (staff_id IN (SELECT id FROM staff WHERE company_id = get_user_company_id()));

CREATE POLICY "Public can view staff_services" ON public.staff_services
  FOR SELECT USING (true);

-- ===== subscriptions =====
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;

CREATE POLICY "Users can update own subscription" ON public.subscriptions
  FOR UPDATE USING (company_id = get_user_company_id());

CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (company_id = get_user_company_id());

-- ===== time_blocks =====
DROP POLICY IF EXISTS "Company members can manage time_blocks" ON public.time_blocks;

CREATE POLICY "Company members can manage time_blocks" ON public.time_blocks
  FOR ALL USING (company_id = get_user_company_id());

-- ===== whatsapp_logs =====
DROP POLICY IF EXISTS "Company members can view whatsapp_logs" ON public.whatsapp_logs;

CREATE POLICY "Company members can view whatsapp_logs" ON public.whatsapp_logs
  FOR SELECT USING (company_id = get_user_company_id());

-- ===== whatsapp_settings =====
DROP POLICY IF EXISTS "Company members can manage whatsapp_settings" ON public.whatsapp_settings;

CREATE POLICY "Company members can manage whatsapp_settings" ON public.whatsapp_settings
  FOR ALL USING (company_id = get_user_company_id());
