CREATE TABLE IF NOT EXISTS public.driver_applications (
  application_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid uuid NOT NULL REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  full_name text,
  phone text,
  residence_area text,
  experience_years text,
  availability text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_applications_user_uuid_key UNIQUE (user_uuid)
);

CREATE INDEX IF NOT EXISTS driver_applications_status_idx
  ON public.driver_applications (status, updated_at DESC);

NOTIFY pgrst, 'reload schema';
