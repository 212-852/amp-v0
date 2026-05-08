import 'server-only'

import { forced_debug_event } from '@/lib/debug'

type uuid_payload = {
  visitor_uuid?: string | null
  user_uuid?: string | null
  room_uuid?: string | null
  participant_uuid?: string | null
}

/**
 * Coerce a UUID-bearing value to a strict `string | null`.
 * Empty strings, whitespace, "null"/"undefined" sentinels are treated as null.
 * Never returns an empty string.
 */
export function clean_uuid(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  if (
    trimmed.length === 0 ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined'
  ) {
    return null
  }

  return trimmed
}

export async function uuid_payload_check(input: uuid_payload) {
  const sanitized = {
    visitor_uuid: clean_uuid(input.visitor_uuid),
    user_uuid: clean_uuid(input.user_uuid),
    room_uuid: clean_uuid(input.room_uuid),
    participant_uuid: clean_uuid(input.participant_uuid),
  }

  await forced_debug_event({
    category: 'line_webhook',
    event: 'uuid_payload_check',
    payload: {
      ...sanitized,
      raw: {
        visitor_uuid: input.visitor_uuid ?? null,
        user_uuid: input.user_uuid ?? null,
        room_uuid: input.room_uuid ?? null,
        participant_uuid: input.participant_uuid ?? null,
      },
    },
  })

  for (const [key, raw_value] of Object.entries(input)) {
    if (typeof raw_value !== 'string') {
      continue
    }

    if (raw_value.trim().length === 0) {
      throw new Error(`invalid_empty_uuid:${key}`)
    }
  }
}
