ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS unread_admin_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS admin_last_read_at timestamptz;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS last_message_body text;

CREATE OR REPLACE FUNCTION public.room_apply_admin_unread_increment(
  p_room_uuid uuid,
  p_message_at timestamptz,
  p_preview text,
  p_source_channel text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rooms
  SET
    unread_admin_count = unread_admin_count + 1,
    last_message_at = p_message_at,
    last_message_body = left(coalesce(p_preview, ''), 500),
    last_incoming_channel = coalesce(
      nullif(trim(p_source_channel), ''),
      last_incoming_channel
    ),
    last_incoming_at = p_message_at,
    updated_at = now()
  WHERE room_uuid = p_room_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.room_mark_admin_read(p_room_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rooms
  SET
    unread_admin_count = 0,
    admin_last_read_at = now(),
    updated_at = now()
  WHERE room_uuid = p_room_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.room_apply_admin_unread_increment(
  uuid, timestamptz, text, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.room_mark_admin_read(uuid) TO service_role;

DO $$
BEGIN
  IF to_regclass('public.rooms') IS NULL THEN
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
      AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;
END $$;

ALTER TABLE public.rooms REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF to_regclass('public.rooms') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'rooms'
      AND c.relrowsecurity
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rooms'
      AND policyname = 'rooms_select_realtime_clients'
  ) THEN
    DROP POLICY rooms_select_realtime_clients ON public.rooms;
  END IF;

  CREATE POLICY rooms_select_realtime_clients
  ON public.rooms
  FOR SELECT
  TO anon, authenticated
  USING (true);
END $$;

NOTIFY pgrst, 'reload schema';
