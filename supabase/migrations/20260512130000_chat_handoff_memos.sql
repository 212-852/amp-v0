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
    CHECK (source_channel IN ('web', 'line', 'liff', 'pwa'))
);

CREATE INDEX IF NOT EXISTS chat_handoff_memos_room_created_idx
  ON public.chat_handoff_memos (room_uuid, created_at);

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
