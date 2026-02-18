
-- Step 1: Add instance_id column to whatsapp_agent_settings
ALTER TABLE public.whatsapp_agent_settings 
  ADD COLUMN instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE;

-- Step 2: Add unique constraint for (company_id, instance_id) allowing NULL instance_id as company default
CREATE UNIQUE INDEX whatsapp_agent_settings_company_instance_key 
  ON public.whatsapp_agent_settings(company_id, instance_id) 
  NULLS NOT DISTINCT;

-- Step 3: Performance index
CREATE INDEX idx_whatsapp_agent_settings_instance_id 
  ON public.whatsapp_agent_settings(instance_id)
  WHERE instance_id IS NOT NULL;
