
-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS: Users can view their own roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles
  FOR SELECT
  USING (user_id = auth.uid());

-- RLS: Super admins can manage all roles
CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Assign super_admin to Marco (current user)
INSERT INTO public.user_roles (user_id, role)
VALUES ('e666fa9f-8113-48c0-b2ea-ce74f67eaaa0', 'super_admin');

-- Super admin policies for viewing all companies
CREATE POLICY "Super admins can view all companies"
  ON public.companies
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update all companies"
  ON public.companies
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Super admin policies for viewing all profiles
CREATE POLICY "Super admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Super admin policies for viewing all subscriptions
CREATE POLICY "Super admins can view all subscriptions"
  ON public.subscriptions
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update all subscriptions"
  ON public.subscriptions
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Super admin policies for viewing all appointments
CREATE POLICY "Super admins can view all appointments"
  ON public.appointments
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Super admin policies for viewing all services
CREATE POLICY "Super admins can view all services"
  ON public.services
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Super admin policies for viewing all staff
CREATE POLICY "Super admins can view all staff"
  ON public.staff
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));
