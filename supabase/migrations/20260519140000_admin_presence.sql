CREATE TABLE IF NOT EXISTS public.presence (
  participant_uuid uuid PRIMARY KEY REFERENCES public.participants(participant_uuid) ON DELETE CASCADE,
  user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  role text NULL,
  source_channel text NULL,
  active_room_uuid uuid NULL REFERENCES public.rooms(room_uuid) ON DELETE CASCADE,
  active_area text NULL,
  visibility_state text NOT NULL DEFAULT 'hidden',
  app_visibility_state text NULL,
  is_active boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS presence_active_room_idx
  ON public.presence (active_room_uuid, visibility_state, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS presence_user_idx
  ON public.presence (user_uuid, active_room_uuid);

DO $$
BEGIN
  IF to_regclass('public.admin_presence') IS NOT NULL THEN
    INSERT INTO public.presence (
      participant_uuid,
      user_uuid,
      role,
      source_channel,
      active_room_uuid,
      active_area,
      visibility_state,
      app_visibility_state,
      is_active,
      last_seen_at,
      updated_at
    )
    SELECT
      ap.participant_uuid,
      ap.admin_user_uuid,
      p.role,
      p.last_channel,
      ap.room_uuid,
      'admin_reception_room',
      ap.visibility_state,
      ap.visibility_state,
      ap.visibility_state = 'visible',
      ap.last_seen_at,
      ap.updated_at
    FROM public.admin_presence ap
    LEFT JOIN public.participants p
      ON p.participant_uuid = ap.participant_uuid
    ON CONFLICT (participant_uuid) DO UPDATE
    SET
      user_uuid = EXCLUDED.user_uuid,
      role = EXCLUDED.role,
      source_channel = EXCLUDED.source_channel,
      active_room_uuid = EXCLUDED.active_room_uuid,
      active_area = EXCLUDED.active_area,
      visibility_state = EXCLUDED.visibility_state,
      app_visibility_state = EXCLUDED.app_visibility_state,
      is_active = EXCLUDED.is_active,
      last_seen_at = EXCLUDED.last_seen_at,
      updated_at = EXCLUDED.updated_at;
  END IF;
END $$;

DROP TABLE IF EXISTS public.admin_presence;

NOTIFY pgrst, 'reload schema';
