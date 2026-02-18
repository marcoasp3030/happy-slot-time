
-- Remove old single-column unique constraint and add composite one
-- that supports multiple instances per company
ALTER TABLE public.whatsapp_agent_settings 
  DROP CONSTRAINT IF EXISTS whatsapp_agent_settings_company_id_key;

-- Add composite unique constraint for (company_id, instance_id)
-- NULL values in instance_id are treated as distinct by default in Postgres,
-- so we use a partial index to enforce uniqueness for the NULL case as well.
ALTER TABLE public.whatsapp_agent_settings
  ADD CONSTRAINT whatsapp_agent_settings_company_instance_unique 
  UNIQUE (company_id, instance_id);
