-- PWA LINE link pending state on public.identities (PostgREST schema cache needs
-- reload in Supabase after apply: Settings > API > Reload schema, or wait for cache TTL).

ALTER TABLE public.identities
  ADD COLUMN IF NOT EXISTS link_state text NULL,
  ADD COLUMN IF NOT EXISTS link_status text NULL,
  ADD COLUMN IF NOT EXISTS link_source_channel text NULL,
  ADD COLUMN IF NOT EXISTS link_return_path text NULL,
  ADD COLUMN IF NOT EXISTS link_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS linked_visitor_uuid uuid NULL,
  ADD COLUMN IF NOT EXISTS link_completed_user_uuid uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS identities_link_state_uidx
  ON public.identities (link_state)
  WHERE link_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS identities_line_link_poll_idx
  ON public.identities (link_state, link_status)
  WHERE link_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS identities_line_oauth_pending_visitor_idx
  ON public.identities (linked_visitor_uuid, link_status)
  WHERE link_status = 'pending'
    AND provider = 'line_oauth_pending';
