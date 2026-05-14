-- Single core: users.profile_json, rooms.concierge_json, identities LINE link state.
-- Stops using admin_profiles / chat_handoff_memos / auth_link_sessions for new writes.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS concierge_json jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.users u
SET profile_json =
  COALESCE(u.profile_json, '{}'::jsonb)
  || jsonb_strip_nulls(
    jsonb_build_object(
      'internal_name', ap.internal_name,
      'real_name', ap.real_name,
      'birth_date', ap.birth_date
    )
  )
FROM public.admin_profiles ap
WHERE ap.user_uuid = u.user_uuid;

UPDATE public.rooms r
SET concierge_json =
  COALESCE(r.concierge_json, '{}'::jsonb)
  || jsonb_strip_nulls(
    jsonb_build_object(
      'handoff_memo',
      NULLIF(btrim(COALESCE(r.handoff_memo, '')), ''),
      'last_handoff_saved_at',
      CASE
        WHEN r.handoff_memo_updated_at IS NOT NULL
        THEN to_jsonb(r.handoff_memo_updated_at)
        ELSE NULL::jsonb
      END,
      'last_handoff_saved_by_user_uuid',
      CASE
        WHEN r.handoff_memo_updated_by IS NOT NULL
        THEN to_jsonb(r.handoff_memo_updated_by::text)
        ELSE NULL::jsonb
      END
    )
  )
WHERE r.handoff_memo IS NOT NULL
  AND length(btrim(r.handoff_memo)) > 0;

WITH memo_threads AS (
  SELECT
    m.room_uuid,
    jsonb_agg(
      jsonb_build_object(
        'memo_uuid', m.memo_uuid::text,
        'body', m.body,
        'saved_by_user_uuid',
        CASE
          WHEN m.saved_by_user_uuid IS NOT NULL THEN m.saved_by_user_uuid::text
          ELSE NULL
        END,
        'saved_by_name', m.saved_by_name,
        'saved_by_role', m.saved_by_role,
        'source_channel', m.source_channel,
        'created_at', m.created_at
      )
      ORDER BY m.created_at DESC
    ) AS threads
  FROM public.chat_handoff_memos m
  GROUP BY m.room_uuid
)
UPDATE public.rooms r
SET concierge_json =
  COALESCE(r.concierge_json, '{}'::jsonb)
  || jsonb_build_object('handoff_threads', memo_threads.threads)
FROM memo_threads
WHERE memo_threads.room_uuid = r.room_uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'identities'
      AND column_name = 'user_uuid'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.identities ALTER COLUMN user_uuid DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.identities
  ADD COLUMN IF NOT EXISTS link_state text NULL,
  ADD COLUMN IF NOT EXISTS link_status text NULL,
  ADD COLUMN IF NOT EXISTS link_source_channel text NULL,
  ADD COLUMN IF NOT EXISTS link_return_path text NULL,
  ADD COLUMN IF NOT EXISTS link_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS linked_visitor_uuid uuid NULL,
  ADD COLUMN IF NOT EXISTS link_completed_user_uuid uuid NULL;

DROP INDEX IF EXISTS public.identities_link_state_uidx;

CREATE UNIQUE INDEX identities_link_state_uidx
  ON public.identities (link_state)
  WHERE link_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS identities_line_link_poll_idx
  ON public.identities (link_state, link_status)
  WHERE link_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS identities_line_oauth_pending_visitor_idx
  ON public.identities (linked_visitor_uuid, link_status)
  WHERE link_status = 'pending'
    AND provider = 'line_oauth_pending';
