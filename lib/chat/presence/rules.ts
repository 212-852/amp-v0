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

function typing_is_fresh(
  participant: presence_participant,
  now: Date,
) {
  if (!participant.is_typing || !participant.typing_at) {
    return false
  }

  const typed_at = new Date(participant.typing_at).getTime()

  if (Number.isNaN(typed_at)) {
    return false
  }

  return now.getTime() - typed_at <= typing_timeout_ms
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
