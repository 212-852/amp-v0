ALTER TABLE public.presence
  ADD COLUMN IF NOT EXISTS active_area text NULL;

NOTIFY pgrst, 'reload schema';
