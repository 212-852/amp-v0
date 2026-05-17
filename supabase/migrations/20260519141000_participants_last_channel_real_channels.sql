UPDATE public.participants
SET last_channel = 'web'
WHERE last_channel = 'admin';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'participants_last_channel_check'
      AND conrelid = 'public.participants'::regclass
  ) THEN
    ALTER TABLE public.participants
      DROP CONSTRAINT participants_last_channel_check;
  END IF;
END $$;

ALTER TABLE public.participants
  ADD CONSTRAINT participants_last_channel_check
  CHECK (
    last_channel IS NULL OR
    last_channel IN ('web', 'pwa', 'liff', 'line')
  );

NOTIFY pgrst, 'reload schema';
