
-- Create platform_settings table (single row for global settings)
CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url text,
  hero_title text DEFAULT 'Sua agenda online,',
  hero_title_highlight text DEFAULT 'sempre organizada',
  hero_subtitle text DEFAULT 'Plataforma completa de agendamentos com página personalizada, notificações automáticas por WhatsApp e painel inteligente para qualquer tipo de negócio.',
  cta_text text DEFAULT 'Pronto para transformar seu negócio?',
  cta_subtitle text DEFAULT 'Comece agora e tenha sua página de agendamentos online em menos de 2 minutos. Sem complicação.',
  footer_text text DEFAULT '© 2025 Slotera. Todos os direitos reservados.',
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid
);

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read platform settings (public landing page)
CREATE POLICY "Public can view platform settings"
ON public.platform_settings FOR SELECT
USING (true);

-- Only super admins can update
CREATE POLICY "Super admins can update platform settings"
ON public.platform_settings FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Only super admins can insert
CREATE POLICY "Super admins can insert platform settings"
ON public.platform_settings FOR INSERT
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Insert default row
INSERT INTO public.platform_settings (id) VALUES (gen_random_uuid());

-- Create storage bucket for platform assets
INSERT INTO storage.buckets (id, name, public) VALUES ('platform-assets', 'platform-assets', true);

-- Public can view platform assets
CREATE POLICY "Public can view platform assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'platform-assets');

-- Super admins can upload platform assets
CREATE POLICY "Super admins can upload platform assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'platform-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can update platform assets
CREATE POLICY "Super admins can update platform assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'platform-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can delete platform assets
CREATE POLICY "Super admins can delete platform assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'platform-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));
