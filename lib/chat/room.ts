import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { debug_event } from '@/lib/debug'

export type chat_channel =
  | 'web'
  | 'line'
  | 'liff'
  | 'pwa'

export type chat_room = {
  room_uuid: string
  participant_uuid: string
  bot_participant_uuid: string
  user_uuid: string | null
  visitor_uuid: string
  channel: chat_channel
}

type resolve_room_input = {
  visitor_uuid: string
  user_uuid?: string | null
  channel: chat_channel
  external_room_id?: string | null
}

type room_row = {
  room_uuid: string
  room_type: string | null
  status: string | null
  updated_at: string | null
}

type participant_row = {
  participant_uuid: string
  room_uuid: string
  user_uuid: string | null
  visitor_uuid: string | null
  role: string
}

type lock_resolve_direct_chat_row = {
  is_new: boolean
  recovery: string | null
  create_kind: 'reuse' | 'move' | 'fresh'
  room: room_row
  participant: participant_row
}

function is_unique_violation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = (error as { code?: string }).code

  return code === '23505'
}

function normalize_room(
  row: room_row,
  participant: participant_row,
  bot_participant: participant_row,
  input: resolve_room_input,
): chat_room {
  return {
    room_uuid: row.room_uuid,
    participant_uuid: participant.participant_uuid,
    bot_participant_uuid: bot_participant.participant_uuid,
    user_uuid: input.user_uuid ?? participant.user_uuid,
    visitor_uuid: input.visitor_uuid,
    channel: input.channel,
  }
}

function debug_identity_payload(input: resolve_room_input) {
  return {
    visitor_uuid: input.visitor_uuid,
    user_uuid: input.user_uuid ?? null,
    source_channel: input.channel,
    room_type: 'direct' as const,
  }
}

function debug_participant_room_payload(input: {
  participant_uuid: string
  room_uuid: string
  source_channel: chat_channel
}) {
  return {
    participant_uuid: input.participant_uuid,
    room_uuid: input.room_uuid,
    room_type: 'direct' as const,
    source_channel: input.source_channel,
  }
}

function parse_lock_resolve_payload(
  data: unknown,
): lock_resolve_direct_chat_row {
  if (!data || typeof data !== 'object') {
    throw new Error('lock_resolve_direct_chat: invalid payload')
  }

  const row = data as Record<string, unknown>
  const room = row.room as room_row | undefined
  const participant = row.participant as participant_row | undefined
  const create_kind = row.create_kind

  if (
    !room?.room_uuid ||
    !participant?.participant_uuid ||
    (create_kind !== 'reuse' &&
      create_kind !== 'move' &&
      create_kind !== 'fresh')
  ) {
    throw new Error('lock_resolve_direct_chat: malformed row')
  }

  return {
    is_new: Boolean(row.is_new),
    recovery:
      typeof row.recovery === 'string' ? row.recovery : null,
    create_kind,
    room,
    participant,
  }
}

async function find_bot_participant(room_uuid: string) {
  const result = await supabase
    .from('participants')
    .select('participant_uuid, room_uuid, user_uuid, visitor_uuid, role')
    .eq('room_uuid', room_uuid)
    .eq('role', 'bot')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data
    ? (result.data as participant_row)
    : null
}

async function create_bot_participant(room_uuid: string) {
  const result = await supabase
    .from('participants')
    .insert({
      room_uuid,
      role: 'bot',
      status: 'active',
    })
    .select('participant_uuid, room_uuid, user_uuid, visitor_uuid, role')
    .single()

  if (result.error) {
    throw result.error
  }

  return result.data as participant_row
}

async function resolve_bot_participant(room_uuid: string) {
  const existing = await find_bot_participant(room_uuid)

  if (existing) {
    return existing
  }

  try {
    return await create_bot_participant(room_uuid)
  } catch (error) {
    if (!is_unique_violation(error)) {
      throw error
    }

    const after_conflict = await find_bot_participant(room_uuid)

    if (after_conflict) {
      return after_conflict
    }

    throw error
  }
}

export async function resolve_chat_room(
  input: resolve_room_input,
): Promise<{
  room: chat_room
  is_new_room: boolean
}> {
  await debug_event({
    category: 'chat_room',
    event: 'participant_lookup_started',
    payload: debug_identity_payload(input),
  })

  const rpc_result = await supabase.rpc('lock_resolve_direct_chat', {
    p_visitor_uuid: input.visitor_uuid,
    p_user_uuid: input.user_uuid ?? null,
    p_last_channel: input.channel,
  })

  if (rpc_result.error) {
    throw rpc_result.error
  }

  const payload = parse_lock_resolve_payload(rpc_result.data)

  if (payload.recovery === 'participant') {
    await debug_event({
      category: 'chat_room',
      event: 'participant_conflict_reused',
      payload: {
        ...debug_identity_payload(input),
        participant_uuid: payload.participant.participant_uuid,
        room_uuid: payload.room.room_uuid,
      },
    })
  }

  if (payload.recovery === 'room') {
    await debug_event({
      category: 'chat_room',
      event: 'room_conflict_reused',
      payload: {
        ...debug_identity_payload(input),
        participant_uuid: payload.participant.participant_uuid,
        room_uuid: payload.room.room_uuid,
      },
    })
  }

  if (payload.create_kind === 'reuse' && !payload.recovery) {
    await debug_event({
      category: 'chat_room',
      event: 'participant_reused',
      payload: {
        ...debug_identity_payload(input),
        participant_uuid: payload.participant.participant_uuid,
        room_uuid: payload.room.room_uuid,
      },
    })

    await debug_event({
      category: 'chat_room',
      event: 'room_reused',
      payload: debug_participant_room_payload({
        participant_uuid: payload.participant.participant_uuid,
        room_uuid: payload.room.room_uuid,
        source_channel: input.channel,
      }),
    })
  }

  if (payload.create_kind === 'fresh') {
    await debug_event({
      category: 'chat_room',
      event: 'participant_created',
      payload: {
        ...debug_identity_payload(input),
        participant_uuid: payload.participant.participant_uuid,
        room_uuid: payload.room.room_uuid,
      },
    })
  }

  if (payload.create_kind === 'fresh' || payload.create_kind === 'move') {
    await debug_event({
      category: 'chat_room',
      event: 'room_created',
      payload: debug_participant_room_payload({
        participant_uuid: payload.participant.participant_uuid,
        room_uuid: payload.room.room_uuid,
        source_channel: input.channel,
      }),
    })
  }

  const bot_participant = await resolve_bot_participant(
    payload.room.room_uuid,
  )

  return {
    room: normalize_room(
      payload.room,
      payload.participant,
      bot_participant,
      input,
    ),
    is_new_room: payload.is_new,
  }
}
