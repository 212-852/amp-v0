ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_typing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS typing_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS participants_room_presence_idx
  ON public.participants (room_uuid, is_active, is_typing);
