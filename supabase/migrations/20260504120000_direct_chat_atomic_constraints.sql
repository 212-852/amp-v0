-- Direct chat dedup: room_type lives on rooms only. Link via participants.room_uuid.
-- Drop legacy objects from earlier drafts if present.

DROP INDEX IF EXISTS public.participants_visitor_direct_unique;
DROP INDEX IF EXISTS public.participants_user_direct_unique;
DROP INDEX IF EXISTS public.rooms_participant_direct_unique;

ALTER TABLE public.participants
  DROP COLUMN IF EXISTS room_type;

ALTER TABLE public.rooms
  DROP COLUMN IF EXISTS participant_uuid;

-- One guest user-participant per visitor (same as 20260204120000; idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_one_guest_per_visitor
  ON public.participants (visitor_uuid)
  WHERE role = 'user' AND user_uuid IS NULL;

-- One member user-participant per authenticated user (direct chat).
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_one_member_per_user
  ON public.participants (user_uuid)
  WHERE role = 'user' AND user_uuid IS NOT NULL;
