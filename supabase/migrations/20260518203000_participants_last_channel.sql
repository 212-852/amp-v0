-- Last surface the user used for chat (web | pwa | liff | line). Used for LINE push copy and open URL.
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS last_channel text NULL;

COMMENT ON COLUMN public.participants.last_channel IS
  'web | pwa | liff | line: last client surface for routing LINE notifications';
