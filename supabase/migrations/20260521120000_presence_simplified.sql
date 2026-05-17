DROP TABLE IF EXISTS public.presence;

CREATE TABLE public.presence (
  user_uuid uuid PRIMARY KEY REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  role text NOT NULL,
  channel text NOT NULL DEFAULT 'web',
  area text NOT NULL DEFAULT 'app',
  visible boolean NOT NULL DEFAULT false,
  seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS presence_visible_seen_idx
  ON public.presence (visible, seen_at DESC);

NOTIFY pgrst, 'reload schema';
