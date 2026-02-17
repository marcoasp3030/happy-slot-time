-- Attach the existing sync function as triggers on appointments table
CREATE TRIGGER sync_appointment_google_calendar_insert
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_appointment_google_calendar();

CREATE TRIGGER sync_appointment_google_calendar_update
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_appointment_google_calendar();