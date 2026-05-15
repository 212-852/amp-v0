ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS last_incoming_channel text;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS last_incoming_at timestamptz;

NOTIFY pgrst, 'reload schema';
