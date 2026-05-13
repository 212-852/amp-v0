-- Align push_subscriptions with PWA device model (no source_channel / user_agent on row).

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_source_channel_check;

ALTER TABLE public.push_subscriptions
  DROP COLUMN IF EXISTS source_channel,
  DROP COLUMN IF EXISTS user_agent;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_type text NULL,
  ADD COLUMN IF NOT EXISTS browser text NULL,
  ADD COLUMN IF NOT EXISTS os text NULL,
  ADD COLUMN IF NOT EXISTS is_pwa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NULL;
