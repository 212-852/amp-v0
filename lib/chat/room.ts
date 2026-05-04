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

async function find_canonical_user_participant(
  input: resolve_room_input,
): Promise<participant_row | null> {
  const select_fields =
    'participant_uuid, room_uuid, user_uuid, visitor_uuid, role'

  if (input.user_uuid) {
    const by_user = await supabase
      .from('participants')
      .select(select_fields)
      .eq('role', 'user')
      .eq('user_uuid', input.user_uuid)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (by_user.error) {
      throw by_user.error
    }

    if (by_user.data) {
      return by_user.data as participant_row
    }
  }

  const by_visitor = await supabase
    .from('participants')
    .select(select_fields)
    .eq('role', 'user')
    .eq('visitor_uuid', input.visitor_uuid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (by_visitor.error) {
    throw by_visitor.error
  }

  return by_visitor.data ? (by_visitor.data as participant_row) : null
}

async function load_room(room_uuid: string) {
  const result = await supabase
    .from('rooms')
    .select('room_uuid, room_type, status, updated_at')
    .eq('room_uuid', room_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data as room_row | null
}

async function delete_orphan_direct_room(room_uuid: string) {
  await supabase.from('rooms').delete().eq('room_uuid', room_uuid)
}

async function insert_direct_room_row(): Promise<room_row> {
  const room_result = await supabase
    .from('rooms')
    .insert({
      room_type: 'direct',
      status: 'active',
    })
    .select('room_uuid, room_type, status, updated_at')
    .single()

  if (room_result.error) {
    throw room_result.error
  }

  return room_result.data as room_row
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

async function update_existing_room(
  input: resolve_room_input,
  participant: participant_row,
) {
  const room = await load_room(participant.room_uuid)

  if (!room) {
    throw new Error('Room not found for participant')
  }

  const participant_update: {
    user_uuid?: string | null
    visitor_uuid: string
    last_channel: chat_channel
    updated_at: string
    status: string
  } = {
    visitor_uuid: input.visitor_uuid,
    last_channel: input.channel,
    updated_at: new Date().toISOString(),
    status: 'active',
  }

  if (input.user_uuid) {
    participant_update.user_uuid = input.user_uuid
  }

  const participant_result = await supabase
    .from('participants')
    .update(participant_update)
    .eq('participant_uuid', participant.participant_uuid)
    .select('participant_uuid, room_uuid, user_uuid, visitor_uuid, role')
    .single()

  if (participant_result.error) {
    throw participant_result.error
  }

  const room_result = await supabase
    .from('rooms')
    .update({
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('room_uuid', room.room_uuid)

  if (room_result.error) {
    throw room_result.error
  }

  return {
    room,
    participant: participant_result.data as participant_row,
  }
}

type create_participant_room_outcome =
  | { outcome: 'inserted'; room: room_row; participant: participant_row }
  | { outcome: 'unique_reuse'; participant: participant_row }

async function try_insert_participant_and_direct_room(
  input: resolve_room_input,
): Promise<create_participant_room_outcome> {
  let room_row: room_row

  try {
    room_row = await insert_direct_room_row()
  } catch (error) {
    if (!is_unique_violation(error)) {
      throw error
    }

    await debug_event({
      category: 'chat_room',
      event: 'room_create_conflict',
      payload: debug_identity_payload(input),
    })

    const existing_after_room_conflict =
      await find_canonical_user_participant(input)

    if (existing_after_room_conflict) {
      await debug_event({
        category: 'chat_room',
        event: 'room_reused_after_conflict',
        payload: {
          ...debug_identity_payload(input),
          participant_uuid: existing_after_room_conflict.participant_uuid,
          room_uuid: existing_after_room_conflict.room_uuid,
        },
      })

      return {
        outcome: 'unique_reuse',
        participant: existing_after_room_conflict,
      }
    }

    room_row = await insert_direct_room_row()
  }

  const participant_result = await supabase
    .from('participants')
    .insert({
      room_uuid: room_row.room_uuid,
      user_uuid: input.user_uuid ?? null,
      visitor_uuid: input.visitor_uuid,
      role: 'user',
      status: 'active',
      last_channel: input.channel,
    })
    .select('participant_uuid, room_uuid, user_uuid, visitor_uuid, role')
    .single()

  if (!participant_result.error) {
    return {
      outcome: 'inserted',
      room: room_row,
      participant: participant_result.data as participant_row,
    }
  }

  if (!is_unique_violation(participant_result.error)) {
    await delete_orphan_direct_room(room_row.room_uuid)
    throw participant_result.error
  }

  await debug_event({
    category: 'chat_room',
    event: 'participant_create_conflict',
    payload: {
      ...debug_identity_payload(input),
      room_uuid: room_row.room_uuid,
    },
  })

  await delete_orphan_direct_room(room_row.room_uuid)

  const existing = await find_canonical_user_participant(input)

  if (!existing) {
    throw participant_result.error
  }

  await debug_event({
    category: 'chat_room',
    event: 'participant_reused_after_conflict',
    payload: {
      ...debug_identity_payload(input),
      participant_uuid: existing.participant_uuid,
      room_uuid: existing.room_uuid,
    },
  })

  return {
    outcome: 'unique_reuse',
    participant: existing,
  }
}

async function move_participant_to_new_direct_room(
  input: resolve_room_input,
  participant: participant_row,
): Promise<{ room: room_row; participant: participant_row }> {
  const room_row = await insert_direct_room_row()

  const participant_update: {
    room_uuid: string
    visitor_uuid: string
    last_channel: chat_channel
    updated_at: string
    status: string
    user_uuid?: string | null
  } = {
    room_uuid: room_row.room_uuid,
    visitor_uuid: input.visitor_uuid,
    last_channel: input.channel,
    updated_at: new Date().toISOString(),
    status: 'active',
  }

  if (input.user_uuid) {
    participant_update.user_uuid = input.user_uuid
  }

  const participant_result = await supabase
    .from('participants')
    .update(participant_update)
    .eq('participant_uuid', participant.participant_uuid)
    .select('participant_uuid, room_uuid, user_uuid, visitor_uuid, role')
    .single()

  if (participant_result.error) {
    await delete_orphan_direct_room(room_row.room_uuid)
    throw participant_result.error
  }

  return {
    room: room_row,
    participant: participant_result.data as participant_row,
  }
}

async function resolve_room_for_user_participant(
  participant: participant_row,
  input: resolve_room_input,
): Promise<{
  room: chat_room
  is_new_room: boolean
}> {
  const linked_room = await load_room(participant.room_uuid)

  if (linked_room && linked_room.room_type === 'direct') {
    const update_result = await update_existing_room(input, participant)
    const bot_participant = await resolve_bot_participant(
      update_result.room.room_uuid,
    )

    await debug_event({
      category: 'chat_room',
      event: 'room_reused',
      payload: debug_participant_room_payload({
        participant_uuid: update_result.participant.participant_uuid,
        room_uuid: update_result.room.room_uuid,
        source_channel: input.channel,
      }),
    })

    return {
      room: normalize_room(
        update_result.room,
        update_result.participant,
        bot_participant,
        input,
      ),
      is_new_room: false,
    }
  }

  const moved = await move_participant_to_new_direct_room(
    input,
    participant,
  )
  const bot_participant = await resolve_bot_participant(moved.room.room_uuid)

  await debug_event({
    category: 'chat_room',
    event: 'room_created',
    payload: debug_participant_room_payload({
      participant_uuid: moved.participant.participant_uuid,
      room_uuid: moved.room.room_uuid,
      source_channel: input.channel,
    }),
  })

  return {
    room: normalize_room(
      moved.room,
      moved.participant,
      bot_participant,
      input,
    ),
    is_new_room: true,
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

  const canonical_participant = await find_canonical_user_participant(input)

  if (canonical_participant) {
    await debug_event({
      category: 'chat_room',
      event: 'participant_reused',
      payload: {
        ...debug_identity_payload(input),
        participant_uuid: canonical_participant.participant_uuid,
        room_uuid: canonical_participant.room_uuid,
      },
    })

    return resolve_room_for_user_participant(canonical_participant, input)
  }

  const create_outcome = await try_insert_participant_and_direct_room(input)

  if (create_outcome.outcome === 'unique_reuse') {
    return resolve_room_for_user_participant(
      create_outcome.participant,
      input,
    )
  }

  const bot_participant = await resolve_bot_participant(
    create_outcome.room.room_uuid,
  )

  await debug_event({
    category: 'chat_room',
    event: 'participant_created',
    payload: {
      ...debug_identity_payload(input),
      participant_uuid: create_outcome.participant.participant_uuid,
      room_uuid: create_outcome.room.room_uuid,
    },
  })

  await debug_event({
    category: 'chat_room',
    event: 'room_created',
    payload: debug_participant_room_payload({
      participant_uuid: create_outcome.participant.participant_uuid,
      room_uuid: create_outcome.room.room_uuid,
      source_channel: input.channel,
    }),
  })

  return {
    room: normalize_room(
      create_outcome.room,
      create_outcome.participant,
      bot_participant,
      input,
    ),
    is_new_room: true,
  }
}
