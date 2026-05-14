-- Align default notification_preferences shape with app storage (pwa_push_enabled + kinds).

ALTER TABLE public.settings
  ALTER COLUMN notification_preferences SET DEFAULT jsonb_build_object(
    'pwa_push_enabled', false,
    'line_enabled', true,
    'kinds', jsonb_build_object(
      'chat', true,
      'reservation', true,
      'announcement', true
    )
  );
