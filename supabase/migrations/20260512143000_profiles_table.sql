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

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS real_name text NULL,
  ADD COLUMN IF NOT EXISTS birth_date date NULL,
  ADD COLUMN IF NOT EXISTS internal_name text NULL,
  ADD COLUMN IF NOT EXISTS display_name text NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by_user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_internal_name_idx
  ON public.profiles (internal_name);

CREATE INDEX IF NOT EXISTS profiles_display_name_idx
  ON public.profiles (display_name);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_owner_core_select
  ON public.profiles;
DROP POLICY IF EXISTS profiles_owner_core_update
  ON public.profiles;
DROP POLICY IF EXISTS profiles_owner_core_insert
  ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_select_own
  ON public.profiles;

CREATE POLICY profiles_owner_core_select
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.user_uuid = auth.uid()
        AND users.role = 'admin'
        AND users.tier IN ('owner', 'core')
    )
  );

CREATE POLICY profiles_owner_core_update
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.user_uuid = auth.uid()
        AND users.role = 'admin'
        AND users.tier IN ('owner', 'core')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.user_uuid = auth.uid()
        AND users.role = 'admin'
        AND users.tier IN ('owner', 'core')
    )
  );

CREATE POLICY profiles_owner_core_insert
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.user_uuid = auth.uid()
        AND users.role = 'admin'
        AND users.tier IN ('owner', 'core')
    )
  );

CREATE POLICY profiles_admin_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    user_uuid = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.user_uuid = auth.uid()
        AND users.role = 'admin'
    )
  );
