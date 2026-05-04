-- One guest user-participant row per visitor (direct room dedup for anonymous sessions).
-- Fails if duplicate (visitor_uuid, role=user, user_uuid IS NULL) rows already exist; clean those first.
-- Does not constrain rows where user_uuid IS NOT NULL (future group/order rooms may need multiple).

CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_one_guest_per_visitor
ON public.participants (visitor_uuid)
WHERE role = 'user' AND user_uuid IS NULL;
