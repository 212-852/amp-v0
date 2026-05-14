ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_settings jsonb NOT NULL DEFAULT jsonb_build_object(
    'push_enabled', false,
    'line_enabled', true,
    'new_chat', true,
    'reservation', true,
    'announcement', true
  );

UPDATE public.users
SET notification_settings =
  notification_settings
  || jsonb_build_object(
    'push_enabled',
    COALESCE(
      (profile_json -> 'notification_preferences' ->> 'push_enabled')::boolean,
      (profile_json -> 'notification_preferences' ->> 'pwa_push_enabled')::boolean,
      (notification_settings ->> 'push_enabled')::boolean,
      false
    ),
    'line_enabled',
    COALESCE(
      (profile_json -> 'notification_preferences' ->> 'line_enabled')::boolean,
      (notification_settings ->> 'line_enabled')::boolean,
      true
    ),
    'new_chat',
    COALESCE(
      (profile_json -> 'notification_preferences' ->> 'new_chat')::boolean,
      (profile_json -> 'notification_preferences' -> 'kinds' ->> 'chat')::boolean,
      (notification_settings ->> 'new_chat')::boolean,
      true
    ),
    'reservation',
    COALESCE(
      (profile_json -> 'notification_preferences' ->> 'reservation')::boolean,
      (profile_json -> 'notification_preferences' -> 'kinds' ->> 'reservation')::boolean,
      (notification_settings ->> 'reservation')::boolean,
      true
    ),
    'announcement',
    COALESCE(
      (profile_json -> 'notification_preferences' ->> 'announcement')::boolean,
      (profile_json -> 'notification_preferences' -> 'kinds' ->> 'announcement')::boolean,
      (notification_settings ->> 'announcement')::boolean,
      true
    )
  );
