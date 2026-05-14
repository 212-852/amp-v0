import 'server-only'

import { clean_uuid } from '@/lib/db/uuid/payload'

import {
  normalize_participant_surface_channel,
  type participant_surface_channel,
} from './rules'

export type presence_mutation_context =
  | {
      ok: true
      room_uuid: string
      participant_uuid: string
      last_channel: participant_surface_channel | null
    }
  | {
      ok: false
      error: 'invalid_presence_context'
    }

export function resolve_presence_mutation_context(input: {
  room_uuid?: unknown
  participant_uuid?: unknown
  last_channel?: unknown
}): presence_mutation_context {
  const room_uuid = clean_uuid(input.room_uuid)
  const participant_uuid = clean_uuid(input.participant_uuid)

  if (!room_uuid || !participant_uuid) {
    return {
      ok: false,
      error: 'invalid_presence_context',
    }
  }

  return {
    ok: true,
    room_uuid,
    participant_uuid,
    last_channel: normalize_participant_surface_channel(input.last_channel),
  }
}
