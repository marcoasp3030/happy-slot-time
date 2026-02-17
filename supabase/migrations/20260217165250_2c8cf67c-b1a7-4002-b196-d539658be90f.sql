
CREATE TRIGGER sync_appointment_google_calendar_trigger
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.sync_appointment_google_calendar();
