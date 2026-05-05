-- One bot participant per room. Required for concurrent room bootstrap.

CREATE UNIQUE INDEX IF NOT EXISTS participants_room_bot_unique
  ON public.participants (room_uuid)
  WHERE room_uuid IS NOT NULL AND role = 'bot';
