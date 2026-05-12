export const typing_timeout_ms = 5_000

export type participant_role =
  | 'user'
  | 'driver'
  | 'admin'
  | 'concierge'
  | 'bot'

export type presence_participant = {
  participant_uuid: string
  display_name: string | null
  avatar_url: string | null
  role: participant_role
  is_active: boolean
  is_typing: boolean
  last_seen_at: string | null
  typing_at: string | null
}

export type visible_presence_participant = {
  participant_uuid: string
  display_name: string
  avatar_url: string | null
  role: participant_role
}

export type reception_room_card = {
  room_uuid: string
  display_name: string | null
  avatar_url: string | null
  latest_message_text: string | null
  latest_message_at: string | null
  typing_participants: visible_presence_participant[]
  active_participants: visible_presence_participant[]
}

export function is_participant_role(value: unknown): value is participant_role {
  return (
    value === 'user' ||
    value === 'driver' ||
    value === 'admin' ||
    value === 'concierge' ||
    value === 'bot'
  )
}

function participant_display_name(participant: presence_participant) {
  const name = participant.display_name?.trim()

  if (name) {
    return name
  }

  if (participant.role === 'user') {
    return 'Guest'
  }

  return participant.role
}

function to_visible_participant(
  participant: presence_participant,
): visible_presence_participant {
  return {
    participant_uuid: participant.participant_uuid,
    display_name: participant_display_name(participant),
    avatar_url: participant.avatar_url,
    role: participant.role,
  }
}

export function typing_timestamp_is_fresh(
  typing_at: string | null,
  is_typing: boolean | null,
  now: Date,
) {
  if (is_typing !== true || !typing_at) {
    return false
  }

  const typed_at = new Date(typing_at).getTime()

  if (Number.isNaN(typed_at)) {
    return false
  }

  return now.getTime() - typed_at <= typing_timeout_ms
}

function typing_is_fresh(
  participant: presence_participant,
  now: Date,
) {
  return typing_timestamp_is_fresh(
    participant.typing_at,
    participant.is_typing,
    now,
  )
}

export type chat_room_list_preview_audience = 'admin_inbox' | 'user_home'

/**
 * Single resolver for chat list / HOME preview: typing overrides latest text.
 */
export function resolve_chat_room_list_preview_text(input: {
  audience: chat_room_list_preview_audience
  latest_message_text: string | null
  typing_user_active: boolean
  typing_staff_lines: string[]
  typing_placeholder_ja: string
  fallback_when_empty: string
}): string {
  if (input.audience === 'user_home') {
    if (input.typing_staff_lines.length > 0) {
      return input.typing_placeholder_ja
    }
  } else {
    if (input.typing_user_active) {
      return input.typing_placeholder_ja
    }

    if (input.typing_staff_lines.length > 0) {
      return input.typing_staff_lines.join(' / ')
    }
  }

  const text = input.latest_message_text?.trim() ?? ''

  if (text.length > 0) {
    return text
  }

  return input.fallback_when_empty
}

export function decide_active_participants(
  participants: presence_participant[],
): visible_presence_participant[] {
  return participants
    .filter((participant) => participant.is_active)
    .map(to_visible_participant)
}

export function decide_typing_participants(
  participants: presence_participant[],
  now: Date,
): visible_presence_participant[] {
  return participants
    .filter((participant) => typing_is_fresh(participant, now))
    .map(to_visible_participant)
}
