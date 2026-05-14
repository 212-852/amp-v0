CREATE TABLE IF NOT EXISTS public.profiles (
  user_uuid uuid PRIMARY KEY REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  real_name text NULL,
  birth_date date NULL,
  internal_name text NULL,
  display_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS profiles_internal_name_idx
  ON public.profiles (internal_name);

CREATE INDEX IF NOT EXISTS profiles_display_name_idx
  ON public.profiles (display_name);
