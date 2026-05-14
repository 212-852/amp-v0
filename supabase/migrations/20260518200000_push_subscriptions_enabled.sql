ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

UPDATE public.push_subscriptions
SET enabled = is_active
WHERE enabled IS DISTINCT FROM is_active;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_enabled_idx
  ON public.push_subscriptions(user_uuid, enabled);
