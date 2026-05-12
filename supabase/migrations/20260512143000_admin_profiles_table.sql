CREATE TABLE IF NOT EXISTS public.admin_profiles (
  user_uuid uuid PRIMARY KEY REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  real_name text NULL,
  birth_date date NULL,
  internal_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL
);

ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS real_name text NULL,
  ADD COLUMN IF NOT EXISTS birth_date date NULL,
  ADD COLUMN IF NOT EXISTS internal_name text NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by_user_uuid uuid NULL REFERENCES public.users(user_uuid) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_profiles'
      AND column_name = 'work_name'
  ) THEN
    EXECUTE 'UPDATE public.admin_profiles SET internal_name = COALESCE(internal_name, work_name)';
    EXECUTE 'ALTER TABLE public.admin_profiles DROP COLUMN work_name';
  END IF;
END $$;

DROP INDEX IF EXISTS public.admin_profiles_work_name_idx;

CREATE INDEX IF NOT EXISTS admin_profiles_internal_name_idx
  ON public.admin_profiles (internal_name);

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_profiles_owner_core_select
  ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_owner_core_update
  ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_owner_core_insert
  ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_admin_select_own
  ON public.admin_profiles;

CREATE POLICY admin_profiles_owner_core_select
  ON public.admin_profiles
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

CREATE POLICY admin_profiles_owner_core_update
  ON public.admin_profiles
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

CREATE POLICY admin_profiles_owner_core_insert
  ON public.admin_profiles
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

CREATE POLICY admin_profiles_admin_select_own
  ON public.admin_profiles
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
