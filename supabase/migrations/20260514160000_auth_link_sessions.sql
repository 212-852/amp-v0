CREATE TABLE IF NOT EXISTS public.auth_link_sessions (
  link_session_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_uuid uuid NULL,
  user_uuid uuid NULL,
  source_channel text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  state text NOT NULL UNIQUE,
  return_path text NULL,
  completed_user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  completed_at timestamptz NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_link_sessions_status_expires_idx
  ON public.auth_link_sessions(status, expires_at);

CREATE INDEX IF NOT EXISTS auth_link_sessions_visitor_idx
  ON public.auth_link_sessions(visitor_uuid);

CREATE INDEX IF NOT EXISTS auth_link_sessions_user_idx
  ON public.auth_link_sessions(user_uuid);
