ALTER TABLE public.admin_presence
  ADD COLUMN IF NOT EXISTS realtime_active boolean NOT NULL DEFAULT false;

UPDATE public.admin_presence
SET realtime_active = visibility_state = 'visible'
WHERE realtime_active IS DISTINCT FROM (visibility_state = 'visible');

NOTIFY pgrst, 'reload schema';
