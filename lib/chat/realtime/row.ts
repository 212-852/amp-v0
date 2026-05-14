import type { archived_message } from '@/lib/chat/archive'
import type { message_bundle } from '@/lib/chat/message'

export type message_insert_row = {
  message_uuid: string
  room_uuid: string
  participant_uuid?: string | null
  channel?: string | null
  body: string | Record<string, unknown> | null
  created_at: string
}

export type realtime_archived_message = archived_message & {
  sender_user_uuid?: string | null
  sender_participant_uuid?: string | null
  sender_role?: string | null
}

type parsed_message_body = {
  bundle?: message_bundle
  bundle_type?: string
  sequence?: number
  user_uuid?: string | null
  participant_uuid?: string | null
  sender_role?: string | null
}

function parse_messages_row_body(
  body: string | Record<string, unknown> | null | undefined,
): parsed_message_body | null {
  if (body === null || body === undefined) {
    return null
  }

  if (typeof body === 'object' && !Array.isArray(body)) {
    return body as parsed_message_body
  }

  if (typeof body !== 'string' || !body.trim()) {
    return null
  }

  try {
    return JSON.parse(body) as parsed_message_body
  } catch {
    return null
  }
}

/**
 * Client-safe parse of `messages.body` (same shape as server archive insert).
 * Supabase Realtime often delivers JSON/JSONB `body` as an object; `load_archived_messages` uses a string.
 */
export function archived_message_from_message_row(
  row: message_insert_row,
): realtime_archived_message | null {
  const parsed = parse_messages_row_body(row.body)

  if (!parsed) {
    return null
  }

  const bundle = parsed.bundle

  if (!bundle) {
    return null
  }

  const sequence = typeof parsed.sequence === 'number' ? parsed.sequence : 0

  return {
    archive_uuid: row.message_uuid,
    room_uuid: row.room_uuid,
    sequence,
    bundle,
    created_at: row.created_at,
    sender_user_uuid:
      typeof parsed.user_uuid === 'string' ? parsed.user_uuid : null,
    sender_participant_uuid:
      typeof parsed.participant_uuid === 'string'
        ? parsed.participant_uuid
        : typeof row.participant_uuid === 'string'
          ? row.participant_uuid
          : null,
    sender_role:
      typeof parsed.sender_role === 'string'
        ? parsed.sender_role
        : typeof bundle.sender === 'string'
          ? bundle.sender
          : null,
  }
}
