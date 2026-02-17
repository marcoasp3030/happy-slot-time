-- Add reschedule message template to all existing companies that don't have one
INSERT INTO public.message_templates (company_id, type, template, active)
SELECT c.id, 'reschedule',
  'Olá {{cliente_nome}}! Seu agendamento para {{servico}} em {{data_antiga}} às {{hora_antiga}} foi remarcado para {{data}} às {{hora}}. {{empresa_nome}}',
  true
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.message_templates mt
  WHERE mt.company_id = c.id AND mt.type = 'reschedule'
);

-- Also update handle_new_user to include reschedule template for new companies
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

  IF v_invite_token IS NOT NULL THEN
    SELECT * INTO v_staff FROM public.staff
    WHERE invite_token = v_invite_token AND invite_status = 'pending'
    LIMIT 1;

    IF v_staff.id IS NOT NULL THEN
      UPDATE public.staff
      SET user_id = NEW.id, invite_status = 'accepted'
      WHERE id = v_staff.id;

      INSERT INTO public.profiles (user_id, full_name, company_id, role)
      VALUES (NEW.id, v_staff.name, v_staff.company_id, 'staff');

      RETURN NEW;
    END IF;
  END IF;

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
    (new_company_id, 'cancellation', 'Seu agendamento para {{servico}} em {{data}} às {{hora}} foi cancelado. {{empresa_nome}}'),
    (new_company_id, 'reschedule', 'Olá {{cliente_nome}}! Seu agendamento para {{servico}} em {{data_antiga}} às {{hora_antiga}} foi remarcado para {{data}} às {{hora}}. {{empresa_nome}}');
  
  INSERT INTO public.notification_rules (company_id, type, minutes_before) VALUES
    (new_company_id, 'reminder_1', 1440),
    (new_company_id, 'reminder_2', 120);
  
  RETURN NEW;
END;
$function$;
