'use client'

function normalize_uuid(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  return trimmed.length ? trimmed : null
}

function normalize_role(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export type typing_broadcast_sender = {
  user_uuid: string | null
  participant_uuid: string
  role: string
}

export type typing_broadcast_active = {
  user_uuid: string | null
  participant_uuid: string | null
  role: string | null
}

/**
 * Decide whether a typing broadcast originated from this client session.
 * - Guest / visitor: compare participant_uuid only.
 * - Member / admin / driver: compare user_uuid + role when both user UUIDs exist.
 * - Fallback: compare participant_uuid when either side has no user_uuid.
 */
export function is_self_typing_broadcast(input: {
  active: typing_broadcast_active
  sender: typing_broadcast_sender
}): { is_self: boolean; comparison_strategy: string } {
  const active_u = normalize_uuid(input.active.user_uuid)
  const sender_u = normalize_uuid(input.sender.user_uuid)
  const active_p = normalize_uuid(input.active.participant_uuid)
  const sender_p = normalize_uuid(input.sender.participant_uuid)
  const active_r = normalize_role(input.active.role)
  const sender_r = normalize_role(input.sender.role)

  if (!sender_p) {
    return { is_self: false, comparison_strategy: 'invalid_sender_participant' }
  }

  if (!active_u || !sender_u) {
    const is_self =
      Boolean(active_p) &&
      sender_p === active_p

    return {
      is_self,
      comparison_strategy: 'guest_participant_only',
    }
  }

  const is_self =
    sender_u === active_u &&
    Boolean(active_r) &&
    sender_r === active_r

  return {
    is_self,
    comparison_strategy: 'member_user_participant_role',
  }
}
