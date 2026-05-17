CREATE TABLE IF NOT EXISTS public.admin_availability (
  admin_user_uuid uuid PRIMARY KEY REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_availability (
  admin_user_uuid,
  is_available,
  updated_at
)
SELECT
  r.user_uuid,
  r.state = 'open',
  COALESCE(r.updated_at, now())
FROM public.receptions r
JOIN public.users u ON u.user_uuid = r.user_uuid
WHERE u.role = 'admin'
ON CONFLICT (admin_user_uuid) DO NOTHING;

CREATE INDEX IF NOT EXISTS admin_availability_visible_idx
  ON public.admin_availability (is_available, updated_at DESC);

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
      AND tablename = 'admin_availability'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_availability;
  END IF;
END $$;

ALTER TABLE public.admin_availability REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
