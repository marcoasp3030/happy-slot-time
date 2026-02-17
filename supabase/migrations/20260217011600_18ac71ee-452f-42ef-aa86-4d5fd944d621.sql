
-- Create trigger function to sync appointments to Google Calendar
CREATE OR REPLACE FUNCTION public.sync_appointment_google_calendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On INSERT: sync new appointment to Google Calendar
  IF TG_OP = 'INSERT' THEN
    PERFORM net.http_post(
      url := 'https://hqzizllylxkfwowwjwxe.supabase.co/functions/v1/google-calendar/sync-appointment',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhxeml6bGx5bHhrZndvd3dqd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExODI3MjMsImV4cCI6MjA4Njc1ODcyM30.yUbiUYrVqvZqyHPD_SaRNL8Sjq9WKvTC8QcK4Bg-GlI"}'::jsonb,
      body := jsonb_build_object('appointmentId', NEW.id, 'companyId', NEW.company_id)
    );
    RETURN NEW;
  END IF;

  -- On UPDATE: if status changed to canceled and has a Google event, delete it
  IF TG_OP = 'UPDATE' AND NEW.status = 'canceled' AND OLD.status IS DISTINCT FROM 'canceled' AND NEW.google_calendar_event_id IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://hqzizllylxkfwowwjwxe.supabase.co/functions/v1/google-calendar/delete-event-internal',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhxeml6bGx5bHhrZndvd3dqd3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExODI3MjMsImV4cCI6MjA4Njc1ODcyM30.yUbiUYrVqvZqyHPD_SaRNL8Sjq9WKvTC8QcK4Bg-GlI"}'::jsonb,
      body := jsonb_build_object('eventId', NEW.google_calendar_event_id, 'companyId', NEW.company_id)
    );
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on appointments table
CREATE TRIGGER sync_google_calendar_on_appointment
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_appointment_google_calendar();
