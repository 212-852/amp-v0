CREATE TABLE IF NOT EXISTS public.admin_presence (
  participant_uuid uuid PRIMARY KEY REFERENCES public.participants(participant_uuid) ON DELETE CASCADE,
  room_uuid uuid NOT NULL REFERENCES public.rooms(room_uuid) ON DELETE CASCADE,
  admin_user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  visibility_state text NOT NULL DEFAULT 'hidden',
  last_seen_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_presence_room_idx
  ON public.admin_presence (room_uuid, visibility_state, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS admin_presence_user_idx
  ON public.admin_presence (admin_user_uuid, room_uuid);

NOTIFY pgrst, 'reload schema';
