-- Rooms is a container only: identity lives on participants/messages.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS created_at timestamptz NULL DEFAULT now();

UPDATE public.rooms
SET created_at = COALESCE(created_at, updated_at, now())
WHERE created_at IS NULL;

ALTER TABLE public.rooms DROP COLUMN IF EXISTS user_uuid;
ALTER TABLE public.rooms DROP COLUMN IF EXISTS visitor_uuid;
ALTER TABLE public.rooms DROP COLUMN IF EXISTS source_channel;
ALTER TABLE public.rooms DROP COLUMN IF EXISTS participant_uuid;
ALTER TABLE public.rooms DROP COLUMN IF EXISTS concierge_requested_at;
ALTER TABLE public.rooms DROP COLUMN IF EXISTS concierge_accepted_at;
ALTER TABLE public.rooms DROP COLUMN IF EXISTS bot_resumed_at;
