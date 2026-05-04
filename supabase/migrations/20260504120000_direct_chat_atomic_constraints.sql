-- Direct chat: one user-participant per (visitor, room_type) and per (user, room_type).
-- One room per (participant_uuid, room_type) when participant_uuid is set.
-- Application resolves rooms via lib/chat/room.ts (table operations only).

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS room_type text;

UPDATE public.participants AS p
SET room_type = COALESCE(r.room_type, 'direct')
FROM public.rooms AS r
WHERE p.room_uuid = r.room_uuid
  AND (p.room_type IS NULL OR p.room_type = '');

UPDATE public.participants
SET room_type = 'direct'
WHERE role = 'user'
  AND (room_type IS NULL OR room_type = '');

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS participant_uuid uuid;

UPDATE public.rooms AS r
SET participant_uuid = p.participant_uuid
FROM public.participants AS p
WHERE p.room_uuid = r.room_uuid
  AND p.role = 'user'
  AND r.participant_uuid IS NULL;

DROP INDEX IF EXISTS public.idx_participants_one_guest_per_visitor;

CREATE UNIQUE INDEX IF NOT EXISTS participants_visitor_direct_unique
  ON public.participants (visitor_uuid, room_type)
  WHERE visitor_uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS participants_user_direct_unique
  ON public.participants (user_uuid, room_type)
  WHERE user_uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rooms_participant_direct_unique
  ON public.rooms (participant_uuid, room_type)
  WHERE participant_uuid IS NOT NULL;
