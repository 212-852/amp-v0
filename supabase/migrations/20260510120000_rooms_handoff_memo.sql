ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS handoff_memo text;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS handoff_memo_updated_at timestamptz;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS handoff_memo_updated_by uuid REFERENCES public.users(user_uuid);
