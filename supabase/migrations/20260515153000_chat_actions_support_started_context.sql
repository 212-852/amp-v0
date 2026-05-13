ALTER TABLE public.chat_actions
  ADD COLUMN IF NOT EXISTS admin_user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_participant_uuid uuid NULL REFERENCES public.participants(participant_uuid) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_participant_uuid uuid NULL REFERENCES public.participants(participant_uuid) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discord_id text NULL,
  ADD COLUMN IF NOT EXISTS meta_json jsonb NULL;

CREATE INDEX IF NOT EXISTS chat_actions_room_created_idx
  ON public.chat_actions (room_uuid, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_actions_discord_id_idx
  ON public.chat_actions (discord_id)
  WHERE discord_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_actions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_actions;
  END IF;
END $$;
