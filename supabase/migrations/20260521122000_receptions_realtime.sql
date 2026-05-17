UPDATE public.receptions
SET state = 'closed'
WHERE state = 'offline';

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.receptions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%state%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.receptions DROP CONSTRAINT IF EXISTS %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.receptions
  ADD CONSTRAINT receptions_state_check
  CHECK (state IN ('open', 'closed'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'receptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.receptions;
  END IF;
END $$;

ALTER TABLE public.receptions REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
