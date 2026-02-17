
-- Tabela de biblioteca de prompts gerenciada pelo super admin
CREATE TABLE public.prompt_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  prompt_content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode ver templates ativos (lojistas precisam listar)
CREATE POLICY "Authenticated can view active prompt_templates"
ON public.prompt_templates
FOR SELECT
TO authenticated
USING (active = true);

-- Super admins gerenciam tudo
CREATE POLICY "Super admins can manage prompt_templates"
ON public.prompt_templates
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_prompt_templates_updated_at
BEFORE UPDATE ON public.prompt_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
