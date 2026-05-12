CREATE TABLE IF NOT EXISTS public.chat_handoff_memos (
  memo_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_uuid uuid NOT NULL REFERENCES public.rooms(room_uuid) ON DELETE CASCADE,
  body text NOT NULL,
  saved_by_participant_uuid uuid NULL REFERENCES public.participants(participant_uuid) ON DELETE SET NULL,
  saved_by_user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  saved_by_name text NULL,
  saved_by_role text NULL,
  source_channel text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_handoff_memos_body_not_empty CHECK (length(btrim(body)) > 0),
  CONSTRAINT chat_handoff_memos_source_channel_check
    CHECK (source_channel IN ('web', 'line', 'liff', 'pwa', 'system'))
);

ALTER TABLE public.chat_handoff_memos
  ADD COLUMN IF NOT EXISTS memo_uuid uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS room_uuid uuid NOT NULL REFERENCES public.rooms(room_uuid) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS body text NOT NULL,
  ADD COLUMN IF NOT EXISTS saved_by_participant_uuid uuid NULL REFERENCES public.participants(participant_uuid) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS saved_by_user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS saved_by_name text NULL,
  ADD COLUMN IF NOT EXISTS saved_by_role text NULL,
  ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_handoff_memos_pkey'
      AND conrelid = 'public.chat_handoff_memos'::regclass
  ) THEN
    ALTER TABLE public.chat_handoff_memos
      ADD CONSTRAINT chat_handoff_memos_pkey PRIMARY KEY (memo_uuid);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_handoff_memos_source_channel_check'
      AND conrelid = 'public.chat_handoff_memos'::regclass
  ) THEN
    ALTER TABLE public.chat_handoff_memos
      DROP CONSTRAINT chat_handoff_memos_source_channel_check;
  END IF;

  ALTER TABLE public.chat_handoff_memos
    ADD CONSTRAINT chat_handoff_memos_source_channel_check
    CHECK (source_channel IN ('web', 'line', 'liff', 'pwa', 'system'));

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_handoff_memos_body_not_empty'
      AND conrelid = 'public.chat_handoff_memos'::regclass
  ) THEN
    ALTER TABLE public.chat_handoff_memos
      ADD CONSTRAINT chat_handoff_memos_body_not_empty
      CHECK (length(btrim(body)) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chat_handoff_memos_room_created_idx
  ON public.chat_handoff_memos (room_uuid, created_at);

CREATE INDEX IF NOT EXISTS chat_handoff_memos_user_created_idx
  ON public.chat_handoff_memos (saved_by_user_uuid, created_at);

ALTER TABLE public.chat_handoff_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_handoff_memos_admin_select
  ON public.chat_handoff_memos;

DROP POLICY IF EXISTS chat_handoff_memos_admin_insert
  ON public.chat_handoff_memos;

CREATE POLICY chat_handoff_memos_admin_select
  ON public.chat_handoff_memos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.user_uuid = auth.uid()
        AND users.role IN ('admin', 'owner', 'core')
    )
  );

CREATE POLICY chat_handoff_memos_admin_insert
  ON public.chat_handoff_memos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.user_uuid = auth.uid()
        AND users.role IN ('admin', 'owner', 'core')
    )
  );

INSERT INTO public.chat_handoff_memos (
  room_uuid,
  body,
  saved_by_user_uuid,
  saved_by_role,
  source_channel,
  created_at
)
SELECT
  room_uuid,
  handoff_memo,
  handoff_memo_updated_by,
  'admin',
  'web',
  COALESCE(handoff_memo_updated_at, now())
FROM public.rooms
WHERE handoff_memo IS NOT NULL
  AND length(btrim(handoff_memo)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.chat_handoff_memos existing
    WHERE existing.room_uuid = rooms.room_uuid
  );
