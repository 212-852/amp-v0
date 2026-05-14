CREATE TABLE IF NOT EXISTS public.notification_settings (
  user_uuid uuid PRIMARY KEY REFERENCES public.users(user_uuid) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT jsonb_build_object(
    'push_enabled', false,
    'line_enabled', true,
    'new_chat', true,
    'reservation', true,
    'announcement', true
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_settings_authenticated_select_own
  ON public.notification_settings;

DROP POLICY IF EXISTS notification_settings_authenticated_insert_own
  ON public.notification_settings;

DROP POLICY IF EXISTS notification_settings_authenticated_update_own
  ON public.notification_settings;

CREATE POLICY notification_settings_authenticated_select_own
  ON public.notification_settings
  FOR SELECT
  TO authenticated
  USING (user_uuid = auth.uid());

CREATE POLICY notification_settings_authenticated_insert_own
  ON public.notification_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_uuid = auth.uid());

CREATE POLICY notification_settings_authenticated_update_own
  ON public.notification_settings
  FOR UPDATE
  TO authenticated
  USING (user_uuid = auth.uid())
  WITH CHECK (user_uuid = auth.uid());

INSERT INTO public.notification_settings (user_uuid, settings, updated_at)
SELECT
  u.user_uuid,
  jsonb_build_object(
    'push_enabled',
    COALESCE(
      (u.notification_settings ->> 'push_enabled')::boolean,
      (u.profile_json -> 'notification_preferences' ->> 'push_enabled')::boolean,
      (u.profile_json -> 'notification_preferences' ->> 'pwa_push_enabled')::boolean,
      false
    ),
    'line_enabled',
    COALESCE(
      (u.notification_settings ->> 'line_enabled')::boolean,
      (u.profile_json -> 'notification_preferences' ->> 'line_enabled')::boolean,
      true
    ),
    'new_chat',
    COALESCE(
      (u.notification_settings ->> 'new_chat')::boolean,
      (u.profile_json -> 'notification_preferences' ->> 'new_chat')::boolean,
      (u.profile_json -> 'notification_preferences' -> 'kinds' ->> 'chat')::boolean,
      true
    ),
    'reservation',
    COALESCE(
      (u.notification_settings ->> 'reservation')::boolean,
      (u.profile_json -> 'notification_preferences' ->> 'reservation')::boolean,
      (u.profile_json -> 'notification_preferences' -> 'kinds' ->> 'reservation')::boolean,
      true
    ),
    'announcement',
    COALESCE(
      (u.notification_settings ->> 'announcement')::boolean,
      (u.profile_json -> 'notification_preferences' ->> 'announcement')::boolean,
      (u.profile_json -> 'notification_preferences' -> 'kinds' ->> 'announcement')::boolean,
      true
    )
  ),
  now()
FROM public.users u
ON CONFLICT (user_uuid) DO NOTHING;
