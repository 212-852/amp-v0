-- Device Web Push endpoints stay in public.push_subscriptions (not identities).
-- RLS: member/vip manage own rows; owner/core can read/delete any row for ops.

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_owner_core_select
  ON public.push_subscriptions;

DROP POLICY IF EXISTS push_subscriptions_owner_core_delete
  ON public.push_subscriptions;

DROP POLICY IF EXISTS push_subscriptions_authenticated_select_own
  ON public.push_subscriptions;

DROP POLICY IF EXISTS push_subscriptions_authenticated_insert_own
  ON public.push_subscriptions;

DROP POLICY IF EXISTS push_subscriptions_authenticated_update_own
  ON public.push_subscriptions;

DROP POLICY IF EXISTS push_subscriptions_authenticated_delete_own
  ON public.push_subscriptions;

CREATE POLICY push_subscriptions_authenticated_select_own
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    user_uuid = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.role = 'user'
        AND u.tier IN ('member', 'vip')
    )
  );

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

CREATE POLICY push_subscriptions_authenticated_insert_own
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_uuid = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.role = 'user'
        AND u.tier IN ('member', 'vip')
    )
    AND (
      participant_uuid IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.participants p
        WHERE p.participant_uuid = participant_uuid
          AND p.user_uuid = auth.uid()
      )
    )
  );

CREATE POLICY push_subscriptions_authenticated_update_own
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    user_uuid = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.role = 'user'
        AND u.tier IN ('member', 'vip')
    )
  )
  WITH CHECK (
    user_uuid = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.role = 'user'
        AND u.tier IN ('member', 'vip')
    )
    AND (
      participant_uuid IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.participants p
        WHERE p.participant_uuid = participant_uuid
          AND p.user_uuid = auth.uid()
      )
    )
  );

CREATE POLICY push_subscriptions_authenticated_delete_own
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (
    user_uuid = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_uuid = auth.uid()
        AND u.role = 'user'
        AND u.tier IN ('member', 'vip')
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
