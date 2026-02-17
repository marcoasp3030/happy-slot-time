
-- =============================================
-- AGENTE IA WHATSAPP - TABELAS FASE 1
-- =============================================

-- 1) Configurações do agente por empresa
CREATE TABLE public.whatsapp_agent_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  greeting_message TEXT DEFAULT 'Olá! 👋 Sou o assistente virtual. Como posso ajudar você hoje?',
  cancellation_policy_hours INTEGER DEFAULT 24,
  max_reschedule_suggestions INTEGER DEFAULT 5,
  respond_audio_with_audio BOOLEAN DEFAULT false,
  handoff_after_failures INTEGER DEFAULT 2,
  openai_api_key TEXT,
  elevenlabs_api_key TEXT,
  elevenlabs_voice_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.whatsapp_agent_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage whatsapp_agent_settings"
  ON public.whatsapp_agent_settings FOR ALL
  USING (company_id = get_user_company_id());

CREATE TRIGGER update_whatsapp_agent_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Conversas do agente (uma por telefone por empresa)
CREATE TABLE public.whatsapp_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  client_name TEXT,
  current_intent TEXT,
  current_appointment_id UUID REFERENCES public.appointments(id),
  status TEXT NOT NULL DEFAULT 'active',
  handoff_requested BOOLEAN DEFAULT false,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage whatsapp_conversations"
  ON public.whatsapp_conversations FOR ALL
  USING (company_id = get_user_company_id());

CREATE INDEX idx_whatsapp_conversations_phone ON public.whatsapp_conversations(company_id, phone);

CREATE TRIGGER update_whatsapp_conversations_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Mensagens individuais
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'incoming',
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage whatsapp_messages"
  ON public.whatsapp_messages FOR ALL
  USING (company_id = get_user_company_id());

CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages(conversation_id, created_at DESC);

-- 4) Base de conhecimento por empresa
CREATE TABLE public.whatsapp_knowledge_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage whatsapp_knowledge_base"
  ON public.whatsapp_knowledge_base FOR ALL
  USING (company_id = get_user_company_id());

CREATE TRIGGER update_whatsapp_knowledge_base_updated_at
  BEFORE UPDATE ON public.whatsapp_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Logs de ações do agente
CREATE TABLE public.whatsapp_agent_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.whatsapp_conversations(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view whatsapp_agent_logs"
  ON public.whatsapp_agent_logs FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY "Service role can insert whatsapp_agent_logs"
  ON public.whatsapp_agent_logs FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_whatsapp_agent_logs_company ON public.whatsapp_agent_logs(company_id, created_at DESC);
