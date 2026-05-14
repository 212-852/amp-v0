CREATE TABLE IF NOT EXISTS public.settings (
  user_uuid uuid PRIMARY KEY REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  notification_preferences jsonb NOT NULL DEFAULT jsonb_build_object(
    'push_enabled', false,
    'line_enabled', true,
    'new_chat', true,
    'reservation', true,
    'announcement', true
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_authenticated_select_own ON public.settings;

DROP POLICY IF EXISTS settings_authenticated_insert_own ON public.settings;

DROP POLICY IF EXISTS settings_authenticated_update_own ON public.settings;

CREATE POLICY settings_authenticated_select_own
  ON public.settings
  FOR SELECT
  TO authenticated
  USING (user_uuid = auth.uid());

CREATE POLICY settings_authenticated_insert_own
  ON public.settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_uuid = auth.uid());

CREATE POLICY settings_authenticated_update_own
  ON public.settings
  FOR UPDATE
  TO authenticated
  USING (user_uuid = auth.uid())
  WITH CHECK (user_uuid = auth.uid());

INSERT INTO public.settings (user_uuid, notification_preferences, updated_at)
SELECT
  ns.user_uuid,
  ns.settings,
  ns.updated_at
FROM public.notification_settings ns
ON CONFLICT (user_uuid) DO NOTHING;
