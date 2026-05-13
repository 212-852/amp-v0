CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  subscription_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  participant_uuid uuid NULL REFERENCES public.participants(participant_uuid) ON DELETE SET NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NULL,
  source_channel text NOT NULL DEFAULT 'pwa',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_source_channel_check
    CHECK (source_channel IN ('web', 'line', 'liff', 'pwa', 'system'))
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx
  ON public.push_subscriptions(endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx
  ON public.push_subscriptions(user_uuid, is_active);

CREATE INDEX IF NOT EXISTS push_subscriptions_participant_idx
  ON public.push_subscriptions(participant_uuid);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_no_anon_select
  ON public.push_subscriptions;

DROP POLICY IF EXISTS push_subscriptions_owner_core_select
  ON public.push_subscriptions;

DROP POLICY IF EXISTS push_subscriptions_owner_core_delete
  ON public.push_subscriptions;

-- Subscriptions are written by the server action with the service role.
-- No anon policy is defined, so public anonymous access is not allowed.
CREATE POLICY push_subscriptions_owner_core_select
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.role = 'admin'
        AND u.tier IN ('owner', 'core')
    )
  );

CREATE POLICY push_subscriptions_owner_core_delete
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.role = 'admin'
        AND u.tier IN ('owner', 'core')
    )
  );
