import type { archived_message } from '@/lib/chat/archive'
import type { message_bundle } from '@/lib/chat/message'

export type message_insert_row = {
  message_uuid: string
  room_uuid: string
  participant_uuid?: string | null
  channel?: string | null
  body: string | Record<string, unknown> | null
  created_at: string
  inserted_at?: string | null
}

export type realtime_archived_message = archived_message & {
  sender_user_uuid?: string | null
  sender_participant_uuid?: string | null
  sender_role?: string | null
  /** `messages.channel` from INSERT row when present. */
  insert_row_channel?: string | null
  /** `body.source_channel` from archived JSON (e.g. line). */
  body_source_channel?: string | null
  /** `body.direction` from archived JSON (e.g. incoming). */
  body_direction?: string | null
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

function pick_nested_text_from_record(
  obj: Record<string, unknown> | null | undefined,
  path: string[],
): string {
  let cur: unknown = obj

  for (const key of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) {
      return ''
    }

    cur = (cur as Record<string, unknown>)[key]
  }

  return typeof cur === 'string' ? cur.trim() : ''
}

/**
 * Client-safe parse of `messages.body` (same shape as server archive insert).
 * Supabase Realtime often delivers JSON/JSONB `body` as an object; `load_archived_messages` uses a string.
 */
function bundle_from_flat_message_body(
  flat: Record<string, unknown>,
  message_uuid: string,
): message_bundle | null {
  const nested = flat.bundle

  if (
    nested &&
    typeof nested === 'object' &&
    !Array.isArray(nested) &&
    typeof (nested as { bundle_type?: unknown }).bundle_type === 'string'
  ) {
    return nested as message_bundle
  }

  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const loose = nested as Record<string, unknown>
    const nested_text = pick_nested_text_from_record(loose, ['payload', 'text'])

    if (nested_text) {
      const sr =
        typeof flat.sender_role === 'string' ? flat.sender_role : null
      const bundle_sender =
        typeof loose.sender === 'string' ? loose.sender : null
      const sender: 'user' | 'bot' =
        sr === 'bot' || bundle_sender === 'bot' ? 'bot' : 'user'

      return {
        bundle_uuid:
          typeof loose.bundle_uuid === 'string' && loose.bundle_uuid.trim()
            ? loose.bundle_uuid.trim()
            : message_uuid,
        bundle_type:
          typeof loose.bundle_type === 'string' && loose.bundle_type.trim()
            ? (loose.bundle_type.trim() as message_bundle['bundle_type'])
            : 'text',
        sender,
        version: 1,
        locale: 'ja',
        payload: {
          text: nested_text,
        },
      } as message_bundle
    }
  }

  let text_raw = typeof flat.text === 'string' ? flat.text.trim() : ''

  if (!text_raw) {
    text_raw = pick_nested_text_from_record(flat, ['payload', 'text'])
  }

  if (!text_raw) {
    text_raw = pick_nested_text_from_record(flat, ['bundle', 'payload', 'text'])
  }

  if (!text_raw) {
    return null
  }

  const sr = typeof flat.sender_role === 'string' ? flat.sender_role : null
  const at = typeof flat.actor_type === 'string' ? flat.actor_type : null
  const sender: 'user' | 'bot' =
    sr === 'bot' || at === 'bot' ? 'bot' : 'user'

  return {
    bundle_uuid: message_uuid,
    bundle_type: 'text',
    sender,
    version: 1,
    locale: 'ja',
    payload: {
      text: text_raw,
    },
  } as message_bundle
}

export function archived_message_from_message_row(
  row: message_insert_row,
): realtime_archived_message | null {
  const parsed = parse_messages_row_body(row.body)

  if (!parsed) {
    return null
  }

  const flat = parsed as Record<string, unknown>
  let bundle = parsed.bundle ?? bundle_from_flat_message_body(flat, row.message_uuid)

  if (!bundle) {
    return null
  }

  const sequence = typeof parsed.sequence === 'number' ? parsed.sequence : 0
  const body_source_channel =
    typeof flat.source_channel === 'string' ? flat.source_channel : null
  const body_direction =
    typeof flat.direction === 'string' ? flat.direction : null

  return {
    archive_uuid: row.message_uuid,
    room_uuid: row.room_uuid,
    sequence,
    bundle,
    created_at: row.created_at,
    inserted_at: row.inserted_at ?? null,
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
    insert_row_channel:
      typeof row.channel === 'string' ? row.channel : null,
    body_source_channel,
    body_direction,
  }
}
