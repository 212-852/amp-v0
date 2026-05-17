ALTER TABLE public.presence
  DROP CONSTRAINT IF EXISTS presence_pkey;

ALTER TABLE public.presence
  ALTER COLUMN participant_uuid DROP NOT NULL;

DELETE FROM public.presence p
USING (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY user_uuid
      ORDER BY updated_at DESC NULLS LAST
    ) AS row_number
  FROM public.presence
  WHERE user_uuid IS NOT NULL
) ranked
WHERE p.ctid = ranked.ctid
  AND ranked.row_number > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'presence_participant_uuid_key'
      AND conrelid = 'public.presence'::regclass
  ) THEN
    ALTER TABLE public.presence
      ADD CONSTRAINT presence_participant_uuid_key UNIQUE (participant_uuid);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'presence_user_uuid_key'
      AND conrelid = 'public.presence'::regclass
  ) THEN
    ALTER TABLE public.presence
      ADD CONSTRAINT presence_user_uuid_key UNIQUE (user_uuid);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
