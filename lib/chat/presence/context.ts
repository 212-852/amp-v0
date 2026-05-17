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
      active_area: string | null
    }
  | {
      ok: false
      error: 'invalid_presence_context'
    }

export function normalize_presence_active_area(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (!normalized || !/^[a-z0-9_]{1,64}$/.test(normalized)) {
    return null
  }

  return normalized
}

export function resolve_presence_mutation_context(input: {
  room_uuid?: unknown
  participant_uuid?: unknown
  last_channel?: unknown
  active_area?: unknown
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
    active_area: normalize_presence_active_area(input.active_area),
  }
}
