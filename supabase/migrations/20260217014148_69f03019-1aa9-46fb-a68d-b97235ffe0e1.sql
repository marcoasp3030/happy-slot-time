
-- Add user_id and invite columns to staff table
ALTER TABLE public.staff ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.staff ADD COLUMN invite_token text;
ALTER TABLE public.staff ADD COLUMN invite_status text NOT NULL DEFAULT 'pending';

CREATE UNIQUE INDEX idx_staff_user_id ON public.staff(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_staff_invite_token ON public.staff(invite_token) WHERE invite_token IS NOT NULL;

-- Add staff_id to google_calendar_tokens (allow per-staff tokens)
ALTER TABLE public.google_calendar_tokens ADD COLUMN staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE;

-- Remove the old unique constraint on company_id (one-to-one) and replace with compound unique
ALTER TABLE public.google_calendar_tokens DROP CONSTRAINT IF EXISTS google_calendar_tokens_company_id_key;
ALTER TABLE public.google_calendar_tokens ADD CONSTRAINT google_calendar_tokens_company_staff_unique UNIQUE (company_id, staff_id);

-- Add sync mode to company_settings
ALTER TABLE public.company_settings ADD COLUMN google_calendar_sync_mode text NOT NULL DEFAULT 'company';

-- Add RLS policy for staff to view their own google calendar tokens
CREATE POLICY "Staff can manage own google tokens"
ON public.google_calendar_tokens
FOR ALL
USING (
  staff_id IN (
    SELECT id FROM public.staff WHERE user_id = auth.uid()
  )
);

-- Add RLS policy for staff to view their own staff record
CREATE POLICY "Staff can view own record"
ON public.staff
FOR SELECT
USING (user_id = auth.uid());

-- Update handle_new_user to support invite flow
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_company_id UUID;
  v_invite_token TEXT;
  v_staff RECORD;
BEGIN
  v_invite_token := NEW.raw_user_meta_data->>'invite_token';

  -- Check if this is a staff invite signup
  IF v_invite_token IS NOT NULL THEN
    -- Find the staff record with this invite token
    SELECT * INTO v_staff FROM public.staff
    WHERE invite_token = v_invite_token AND invite_status = 'pending'
    LIMIT 1;

    IF v_staff.id IS NOT NULL THEN
      -- Link staff to user
      UPDATE public.staff
      SET user_id = NEW.id, invite_status = 'accepted'
      WHERE id = v_staff.id;

      -- Create profile linked to the staff's company (role = 'staff')
      INSERT INTO public.profiles (user_id, full_name, company_id, role)
      VALUES (NEW.id, v_staff.name, v_staff.company_id, 'staff');

      RETURN NEW;
    END IF;
  END IF;

  -- Normal signup flow: create company, profile, etc.
  INSERT INTO public.companies (owner_id, name, slug)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'company_name', 'Minha Empresa'), 
          LOWER(REPLACE(COALESCE(NEW.raw_user_meta_data->>'company_name', 'empresa-' || substr(NEW.id::text, 1, 8)), ' ', '-')))
  RETURNING id INTO new_company_id;
  
  INSERT INTO public.profiles (user_id, full_name, company_id, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), new_company_id, 'admin');
  
  INSERT INTO public.subscriptions (company_id) VALUES (new_company_id);
  
  INSERT INTO public.business_hours (company_id, day_of_week, open_time, close_time, is_open)
  VALUES 
    (new_company_id, 1, '09:00', '18:00', true),
    (new_company_id, 2, '09:00', '18:00', true),
    (new_company_id, 3, '09:00', '18:00', true),
    (new_company_id, 4, '09:00', '18:00', true),
    (new_company_id, 5, '09:00', '18:00', true),
    (new_company_id, 6, '09:00', '13:00', true),
    (new_company_id, 0, '00:00', '00:00', false);
  
  INSERT INTO public.company_settings (company_id) VALUES (new_company_id);
  INSERT INTO public.public_page_settings (company_id) VALUES (new_company_id);
  
  INSERT INTO public.message_templates (company_id, type, template) VALUES
    (new_company_id, 'confirmation', 'Olá {{cliente_nome}}! Seu agendamento para {{servico}} em {{data}} às {{hora}} foi confirmado. {{empresa_nome}}'),
    (new_company_id, 'reminder', 'Lembrete: Você tem um agendamento para {{servico}} amanhã às {{hora}}. {{empresa_nome}}'),
    (new_company_id, 'cancellation', 'Seu agendamento para {{servico}} em {{data}} às {{hora}} foi cancelado. {{empresa_nome}}');
  
  INSERT INTO public.notification_rules (company_id, type, minutes_before) VALUES
    (new_company_id, 'reminder_1', 1440),
    (new_company_id, 'reminder_2', 120);
  
  RETURN NEW;
END;
$function$;
