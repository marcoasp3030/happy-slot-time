
-- Add blocked column to companies
ALTER TABLE public.companies ADD COLUMN blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.companies ADD COLUMN blocked_reason TEXT;

-- Super admin can delete companies (for management)
CREATE POLICY "Super admins can delete companies"
  ON public.companies
  FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Create admin_notifications table for mass notifications
CREATE TABLE public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'all',
  sent_by UUID NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  recipient_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage notifications"
  ON public.admin_notifications
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Company-level notifications inbox
CREATE TABLE public.company_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.company_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view own notifications"
  ON public.company_notifications
  FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY "Company members can update own notifications"
  ON public.company_notifications
  FOR UPDATE
  USING (company_id = get_user_company_id());

CREATE POLICY "Super admins can manage company notifications"
  ON public.company_notifications
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));
