
-- Table to store Google Calendar OAuth tokens per company
CREATE TABLE public.google_calendar_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  connected_email TEXT,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- Enable RLS
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Company members can view their own token status
CREATE POLICY "Company members can view own google tokens"
ON public.google_calendar_tokens
FOR SELECT
USING (company_id = get_user_company_id());

-- Company members can delete (disconnect)
CREATE POLICY "Company members can delete own google tokens"
ON public.google_calendar_tokens
FOR DELETE
USING (company_id = get_user_company_id());

-- Super admins can manage all
CREATE POLICY "Super admins can manage all google tokens"
ON public.google_calendar_tokens
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Service role (edge functions) needs insert/update - handled via service_role key

-- Add google_calendar_event_id to appointments for tracking
ALTER TABLE public.appointments
ADD COLUMN google_calendar_event_id TEXT;

-- Trigger for updated_at
CREATE TRIGGER update_google_calendar_tokens_updated_at
BEFORE UPDATE ON public.google_calendar_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
