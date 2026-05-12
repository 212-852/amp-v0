-- Required for browser postgres_changes delivery on public.messages.
-- If callbacks never fire while subscribe and insert both succeed, the usual
-- causes are publication membership, replica identity, or RLS SELECT visibility.

DO $$
BEGIN
  IF to_regclass('public.messages') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;

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
    DROP POLICY messages_select_realtime_clients ON public.messages;
  END IF;

  CREATE POLICY messages_select_realtime_clients
  ON public.messages
  FOR SELECT
  TO anon, authenticated
  USING (true);
END $$;
