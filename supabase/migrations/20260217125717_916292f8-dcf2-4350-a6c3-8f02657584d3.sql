
-- Remove overly permissive INSERT policy (edge function uses service role which bypasses RLS)
DROP POLICY IF EXISTS "Service role can insert whatsapp_agent_logs" ON public.whatsapp_agent_logs;
