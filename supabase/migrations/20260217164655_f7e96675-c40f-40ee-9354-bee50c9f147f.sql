-- Add source column to appointments to track where the appointment came from
ALTER TABLE public.appointments ADD COLUMN source text NOT NULL DEFAULT 'local';

-- Add index for efficient querying of external appointments
CREATE INDEX idx_appointments_source ON public.appointments(source);
CREATE INDEX idx_appointments_google_event ON public.appointments(google_calendar_event_id) WHERE google_calendar_event_id IS NOT NULL;