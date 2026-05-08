import 'server-only'

import { forced_debug_event } from '@/lib/debug'

type uuid_payload = {
  visitor_uuid?: string | null
  user_uuid?: string | null
  room_uuid?: string | null
  participant_uuid?: string | null
}

export async function uuid_payload_check(input: uuid_payload) {
  await forced_debug_event({
    category: 'line_webhook',
    event: 'uuid_payload_check',
    payload: {
      visitor_uuid: input.visitor_uuid ?? null,
      user_uuid: input.user_uuid ?? null,
      room_uuid: input.room_uuid ?? null,
      participant_uuid: input.participant_uuid ?? null,
    },
  })

  for (const [key, value] of Object.entries(input)) {
    if (value === '') {
      throw new Error(`invalid_empty_uuid:${key}`)
    }
  }
}
