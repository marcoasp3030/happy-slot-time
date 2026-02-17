
-- Audit logs table for comprehensive activity tracking
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  entity_type text,
  entity_id text,
  details jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX idx_audit_logs_company_id ON public.audit_logs(company_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_category ON public.audit_logs(category);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Company members can view their own logs
CREATE POLICY "Company members can view audit_logs"
ON public.audit_logs FOR SELECT
USING (company_id = get_user_company_id());

-- Company members can insert logs
CREATE POLICY "Company members can insert audit_logs"
ON public.audit_logs FOR INSERT
WITH CHECK (company_id = get_user_company_id());

-- Super admins can view all logs
CREATE POLICY "Super admins can view all audit_logs"
ON public.audit_logs FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Public can insert audit logs (for login events from unauthenticated context)
CREATE POLICY "Public can insert audit_logs"
ON public.audit_logs FOR INSERT
WITH CHECK (action IN ('login', 'login_failed', 'signup', 'logout'));
