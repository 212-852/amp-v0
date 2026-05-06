-- Denormalized room context for stable selects (no participant joins in room core read path).

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS user_uuid uuid NULL,
  ADD COLUMN IF NOT EXISTS visitor_uuid uuid NULL,
  ADD COLUMN IF NOT EXISTS source_channel text NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NULL DEFAULT now();

UPDATE public.rooms r
SET
  user_uuid = p.user_uuid,
  visitor_uuid = p.visitor_uuid
FROM public.participants p
WHERE p.room_uuid = r.room_uuid
  AND p.role = 'user'
  AND (r.user_uuid IS NULL OR r.visitor_uuid IS NULL);

UPDATE public.rooms
SET created_at = COALESCE(created_at, updated_at, now())
WHERE created_at IS NULL;
