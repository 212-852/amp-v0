-- One user-role participant per visitor and per authenticated user (direct chat).

DROP INDEX IF EXISTS public.idx_participants_one_guest_per_visitor;
DROP INDEX IF EXISTS public.idx_participants_one_member_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS participants_visitor_user_unique
  ON public.participants (visitor_uuid)
  WHERE visitor_uuid IS NOT NULL AND role = 'user';

CREATE UNIQUE INDEX IF NOT EXISTS participants_user_user_unique
  ON public.participants (user_uuid)
  WHERE user_uuid IS NOT NULL AND role = 'user';
