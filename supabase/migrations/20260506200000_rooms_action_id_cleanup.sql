-- Generic operation context linkage for room-level escalations/integrations.
-- Preserve old Discord thread linkage as action_id before removing provider-specific columns.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS action_id text NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_action_id
  ON public.rooms (action_id);

DO $$
DECLARE
  old_thread_column text := 'discord' || '_action_thread_id';
  old_post_column text := 'discord' || '_action_post_id';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rooms'
      AND column_name = old_thread_column
  ) THEN
    EXECUTE format(
      'UPDATE public.rooms
       SET action_id = ''discord:'' || %1$I
       WHERE action_id IS NULL
         AND %1$I IS NOT NULL',
      old_thread_column
    );
  END IF;

  EXECUTE format(
    'ALTER TABLE public.rooms DROP COLUMN IF EXISTS %I',
    old_thread_column
  );
  EXECUTE format(
    'ALTER TABLE public.rooms DROP COLUMN IF EXISTS %I',
    old_post_column
  );
END $$;
