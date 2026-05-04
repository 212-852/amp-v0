-- Direct chat: one user-participant per (visitor, room_type) and per (user, room_type).
-- One room per (participant_uuid, room_type) when participant_uuid is set.
-- lock_resolve_direct_chat serializes create/reuse per visitor or per logged-in user.

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS room_type text;

UPDATE public.participants AS p
SET room_type = COALESCE(r.room_type, 'direct')
FROM public.rooms AS r
WHERE p.room_uuid = r.room_uuid
  AND (p.room_type IS NULL OR p.room_type = '');

UPDATE public.participants
SET room_type = 'direct'
WHERE role = 'user'
  AND (room_type IS NULL OR room_type = '');

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS participant_uuid uuid;

UPDATE public.rooms AS r
SET participant_uuid = p.participant_uuid
FROM public.participants AS p
WHERE p.room_uuid = r.room_uuid
  AND p.role = 'user'
  AND r.participant_uuid IS NULL;

DROP INDEX IF EXISTS public.idx_participants_one_guest_per_visitor;

CREATE UNIQUE INDEX IF NOT EXISTS participants_visitor_direct_unique
  ON public.participants (visitor_uuid, room_type)
  WHERE visitor_uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS participants_user_direct_unique
  ON public.participants (user_uuid, room_type)
  WHERE user_uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rooms_participant_direct_unique
  ON public.rooms (participant_uuid, room_type)
  WHERE participant_uuid IS NOT NULL;

CREATE OR REPLACE FUNCTION public.lock_resolve_direct_chat(
  p_visitor_uuid uuid,
  p_user_uuid uuid,
  p_last_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_participant public.participants%ROWTYPE;
  v_room public.rooms%ROWTYPE;
  v_new_room public.rooms%ROWTYPE;
  v_now timestamptz := now();
  v_recovery text := null;
  v_pid uuid;
BEGIN
  IF p_user_uuid IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_user_uuid::text));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext(p_visitor_uuid::text));
  END IF;

  IF p_user_uuid IS NOT NULL THEN
    SELECT p.*
    INTO v_participant
    FROM public.participants AS p
    WHERE p.role = 'user'
      AND p.user_uuid = p_user_uuid
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_participant.participant_uuid IS NULL THEN
    SELECT p.*
    INTO v_participant
    FROM public.participants AS p
    WHERE p.role = 'user'
      AND p.visitor_uuid = p_visitor_uuid
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_participant.participant_uuid IS NOT NULL THEN
    SELECT r.*
    INTO v_room
    FROM public.rooms AS r
    WHERE r.room_uuid = v_participant.room_uuid;

    v_pid := v_participant.participant_uuid;

    IF v_room.room_type = 'direct' THEN
      UPDATE public.participants
      SET
        visitor_uuid = p_visitor_uuid,
        user_uuid = COALESCE(p_user_uuid, user_uuid),
        last_channel = p_last_channel,
        updated_at = v_now,
        status = 'active',
        room_type = 'direct'
      WHERE participant_uuid = v_pid;

      UPDATE public.rooms
      SET
        status = 'active',
        updated_at = v_now,
        participant_uuid = v_pid
      WHERE room_uuid = v_room.room_uuid;

      SELECT p.*
      INTO v_participant
      FROM public.participants AS p
      WHERE p.participant_uuid = v_pid;

      SELECT r.*
      INTO v_room
      FROM public.rooms AS r
      WHERE r.room_uuid = v_participant.room_uuid;

      RETURN jsonb_build_object(
        'is_new', false,
        'recovery', null,
        'create_kind', 'reuse',
        'room', to_jsonb(v_room),
        'participant', to_jsonb(v_participant)
      );
    END IF;

    INSERT INTO public.rooms (room_type, status, updated_at)
    VALUES ('direct', 'active', v_now)
    RETURNING * INTO v_new_room;

    UPDATE public.participants
    SET
      room_uuid = v_new_room.room_uuid,
      visitor_uuid = p_visitor_uuid,
      user_uuid = COALESCE(p_user_uuid, user_uuid),
      last_channel = p_last_channel,
      updated_at = v_now,
      status = 'active',
      room_type = 'direct'
    WHERE participant_uuid = v_pid;

    UPDATE public.rooms
    SET
      participant_uuid = v_pid,
      updated_at = v_now,
      status = 'active'
    WHERE room_uuid = v_new_room.room_uuid;

    SELECT p.*
    INTO v_participant
    FROM public.participants AS p
    WHERE p.participant_uuid = v_pid;

    SELECT r.*
    INTO v_room
    FROM public.rooms AS r
    WHERE r.room_uuid = v_participant.room_uuid;

    RETURN jsonb_build_object(
      'is_new', true,
      'recovery', null,
      'create_kind', 'move',
      'room', to_jsonb(v_room),
      'participant', to_jsonb(v_participant)
    );
  END IF;

  INSERT INTO public.rooms (room_type, status, updated_at)
  VALUES ('direct', 'active', v_now)
  RETURNING * INTO v_room;

  BEGIN
    INSERT INTO public.participants (
      room_uuid,
      user_uuid,
      visitor_uuid,
      role,
      room_type,
      status,
      last_channel,
      updated_at
    )
    VALUES (
      v_room.room_uuid,
      p_user_uuid,
      p_visitor_uuid,
      'user',
      'direct',
      'active',
      p_last_channel,
      v_now
    )
    RETURNING * INTO v_participant;
  EXCEPTION
    WHEN unique_violation THEN
      v_recovery := 'participant';
      DELETE FROM public.rooms WHERE room_uuid = v_room.room_uuid;

      IF p_user_uuid IS NOT NULL THEN
        SELECT p.*
        INTO v_participant
        FROM public.participants AS p
        WHERE p.role = 'user'
          AND p.user_uuid = p_user_uuid
          AND p.room_type = 'direct'
        ORDER BY p.updated_at DESC NULLS LAST
        LIMIT 1;
      END IF;

      IF v_participant.participant_uuid IS NULL THEN
        SELECT p.*
        INTO v_participant
        FROM public.participants AS p
        WHERE p.role = 'user'
          AND p.visitor_uuid = p_visitor_uuid
          AND p.room_type = 'direct'
        ORDER BY p.updated_at DESC NULLS LAST
        LIMIT 1;
      END IF;

      SELECT r.*
      INTO v_room
      FROM public.rooms AS r
      WHERE r.room_uuid = v_participant.room_uuid;

      v_pid := v_participant.participant_uuid;

      UPDATE public.participants
      SET
        visitor_uuid = p_visitor_uuid,
        user_uuid = COALESCE(p_user_uuid, user_uuid),
        last_channel = p_last_channel,
        updated_at = v_now,
        status = 'active'
      WHERE participant_uuid = v_pid;

      UPDATE public.rooms
      SET
        status = 'active',
        updated_at = v_now,
        participant_uuid = v_pid
      WHERE room_uuid = v_room.room_uuid;

      SELECT p.*
      INTO v_participant
      FROM public.participants AS p
      WHERE p.participant_uuid = v_pid;

      SELECT r.*
      INTO v_room
      FROM public.rooms AS r
      WHERE r.room_uuid = v_participant.room_uuid;

      RETURN jsonb_build_object(
        'is_new', false,
        'recovery', v_recovery,
        'create_kind', 'reuse',
        'room', to_jsonb(v_room),
        'participant', to_jsonb(v_participant)
      );
  END;

  UPDATE public.rooms
  SET
    participant_uuid = v_participant.participant_uuid,
    updated_at = v_now
  WHERE room_uuid = v_room.room_uuid;

  SELECT r.*
  INTO v_room
  FROM public.rooms AS r
  WHERE r.room_uuid = v_room.room_uuid;

  SELECT p.*
  INTO v_participant
  FROM public.participants AS p
  WHERE p.participant_uuid = v_participant.participant_uuid;

  RETURN jsonb_build_object(
    'is_new', true,
    'recovery', null,
    'create_kind', 'fresh',
    'room', to_jsonb(v_room),
    'participant', to_jsonb(v_participant)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_resolve_direct_chat(uuid, uuid, text)
  TO service_role;
