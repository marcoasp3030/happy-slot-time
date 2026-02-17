
-- Add agent capability columns to whatsapp_agent_settings
ALTER TABLE public.whatsapp_agent_settings
  ADD COLUMN IF NOT EXISTS can_share_address boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_share_phone boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_share_business_hours boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_share_services boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_share_professionals boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_handle_anamnesis boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send_files boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send_images boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send_audio boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_business_info text DEFAULT NULL;

-- Create table for agent files (PDFs, images, audio)
CREATE TABLE public.whatsapp_agent_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'document',
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_agent_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage whatsapp_agent_files"
  ON public.whatsapp_agent_files
  FOR ALL
  USING (company_id = get_user_company_id());

-- Create storage bucket for agent files
INSERT INTO storage.buckets (id, name, public) VALUES ('agent-files', 'agent-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Company members can upload agent files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'agent-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Company members can delete agent files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'agent-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view agent files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agent-files');
