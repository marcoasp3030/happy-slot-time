
-- Drop all WhatsApp and related tables (order matters for foreign keys)

-- First drop tables that reference others
DROP TABLE IF EXISTS public.whatsapp_messages CASCADE;
DROP TABLE IF EXISTS public.whatsapp_agent_logs CASCADE;
DROP TABLE IF EXISTS public.whatsapp_agent_files CASCADE;
DROP TABLE IF EXISTS public.whatsapp_agent_settings CASCADE;
DROP TABLE IF EXISTS public.whatsapp_knowledge_base CASCADE;
DROP TABLE IF EXISTS public.whatsapp_logs CASCADE;
DROP TABLE IF EXISTS public.whatsapp_conversations CASCADE;
DROP TABLE IF EXISTS public.whatsapp_instances CASCADE;
DROP TABLE IF EXISTS public.whatsapp_settings CASCADE;

-- Mass messaging tables
DROP TABLE IF EXISTS public.mass_campaign_contacts CASCADE;
DROP TABLE IF EXISTS public.mass_campaigns CASCADE;
DROP TABLE IF EXISTS public.mass_contacts CASCADE;
DROP TABLE IF EXISTS public.mass_contact_lists CASCADE;

-- Automation tables
DROP TABLE IF EXISTS public.automation_logs CASCADE;
DROP TABLE IF EXISTS public.automation_flows CASCADE;

-- Contact tags
DROP TABLE IF EXISTS public.contact_tags CASCADE;

-- LLM/Token usage tables
DROP TABLE IF EXISTS public.llm_usage_logs CASCADE;
DROP TABLE IF EXISTS public.llm_usage_limits CASCADE;
DROP TABLE IF EXISTS public.llm_model_pricing CASCADE;

-- Message templates and notification rules (WhatsApp notifications)
DROP TABLE IF EXISTS public.message_templates CASCADE;
DROP TABLE IF EXISTS public.notification_rules CASCADE;

-- Remove realtime publications for these tables
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.whatsapp_messages';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.whatsapp_conversations';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
