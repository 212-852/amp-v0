-- Support action log (admin support_started) and concierge inbox flag on rooms.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS concierge_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.support_actions (
  action_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_uuid uuid NOT NULL REFERENCES public.rooms (room_uuid) ON DELETE CASCADE,
  kind text NOT NULL,
  admin_user_uuid uuid REFERENCES public.users (user_uuid),
  discord_id text NULL,
  customer_display_name text NULL,
  admin_internal_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_actions_room_uuid
  ON public.support_actions (room_uuid);

CREATE INDEX IF NOT EXISTS idx_support_actions_created_at
  ON public.support_actions (created_at DESC);
