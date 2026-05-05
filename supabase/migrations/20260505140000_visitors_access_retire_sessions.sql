-- Guest/browser access metadata lives on public.visitors only.
-- Backfill from public.sessions when present, then drop sessions.

ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS access_channel text,
  ADD COLUMN IF NOT EXISTS access_platform text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

DO $$
BEGIN
  IF to_regclass('public.sessions') IS NOT NULL THEN
    UPDATE public.visitors v
    SET
      access_channel = COALESCE(v.access_channel, s.access_channel::text),
      access_platform = COALESCE(v.access_platform, s.access_platform::text),
      locale = COALESCE(v.locale, s.locale::text),
      user_agent = COALESCE(v.user_agent, s.user_agent::text),
      last_seen_at = COALESCE(v.last_seen_at, s.last_seen_at, s.updated_at)
    FROM public.sessions s
    WHERE v.visitor_uuid = s.visitor_uuid
       OR v.visitor_uuid::text = s.session_uuid::text;

    DROP TABLE public.sessions CASCADE;
  END IF;
END $$;
