-- Chat room concierge mode (bot | concierge only). Business state is rooms.mode.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'bot',
  ADD COLUMN IF NOT EXISTS action_id text NULL,
  ADD COLUMN IF NOT EXISTS discord_action_post_id text NULL,
  ADD COLUMN IF NOT EXISTS concierge_requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS concierge_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS bot_resumed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_action_id
  ON public.rooms (action_id);

ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS rooms_mode_check;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_mode_check CHECK (mode IN ('bot', 'concierge'));
