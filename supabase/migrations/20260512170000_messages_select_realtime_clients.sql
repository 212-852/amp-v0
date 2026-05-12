-- Realtime `postgres_changes` applies RLS using the subscriber JWT.
-- `lib/db/browser.ts` uses the anon key without Supabase Auth session, so the
-- role is typically `anon`. If `public.messages` has RLS enabled and no SELECT
-- policy for `anon`, INSERT events are not delivered to the browser channel.

DO $$
BEGIN
  IF to_regclass('public.messages') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'messages'
      AND c.relrowsecurity
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'messages_select_realtime_clients'
  ) THEN
    RETURN;
  END IF;

  EXECUTE $pol$
    CREATE POLICY messages_select_realtime_clients
    ON public.messages
    FOR SELECT
    TO anon, authenticated
    USING (true)
  $pol$;
END $$;
