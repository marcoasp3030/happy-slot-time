-- Tabela de atendimentos/ocorrências
CREATE TABLE public.atendimentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  phone TEXT NOT NULL,
  client_name TEXT,
  condominium_name TEXT,
  problem_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'aberto',
  priority TEXT NOT NULL DEFAULT 'normal',
  resolved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para busca rápida por empresa e telefone
CREATE INDEX idx_atendimentos_company_id ON public.atendimentos(company_id);
CREATE INDEX idx_atendimentos_phone ON public.atendimentos(company_id, phone);
CREATE INDEX idx_atendimentos_status ON public.atendimentos(company_id, status);

-- Constraint: máximo 1 atendimento por cliente (telefone) por dia por empresa
CREATE UNIQUE INDEX idx_atendimentos_unique_daily 
ON public.atendimentos(company_id, phone, DATE(created_at AT TIME ZONE 'America/Sao_Paulo'));

-- Trigger de updated_at
CREATE TRIGGER update_atendimentos_updated_at
BEFORE UPDATE ON public.atendimentos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Company members can manage atendimentos"
ON public.atendimentos
FOR ALL
USING (company_id = get_user_company_id());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimentos;