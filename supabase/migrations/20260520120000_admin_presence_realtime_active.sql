ALTER TABLE public.presence
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

UPDATE public.presence
SET is_active = visibility_state = 'visible'
WHERE is_active IS DISTINCT FROM (visibility_state = 'visible');

NOTIFY pgrst, 'reload schema';
