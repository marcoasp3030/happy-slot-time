
-- Add anti-ban strategy columns to mass_campaigns
ALTER TABLE public.mass_campaigns
  ADD COLUMN IF NOT EXISTS delay_min integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS delay_max integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS daily_limit integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS business_hours_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rotate_instances boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sent_date date;
