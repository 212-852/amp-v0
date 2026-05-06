-- Generic operation context linkage for room-level escalations/integrations.
-- Provider-agnostic (e.g. discord:..., ticket:..., line:...).

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS action_id text NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_action_id
  ON public.rooms (action_id);
