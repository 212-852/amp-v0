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
  return (await find_bot_participant(room_uuid)) ??
    await create_bot_participant(room_uuid)
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

async function create_participant_and_direct_room(input: resolve_room_input) {
  const room_row = await insert_direct_room_row()

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

  if (participant_result.error) {
    throw participant_result.error
  }

  return {
    room: room_row,
    participant: participant_result.data as participant_row,
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
    throw participant_result.error
  }

  return {
    room: room_row,
    participant: participant_result.data as participant_row,
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

    const linked_room = await load_room(canonical_participant.room_uuid)

    if (linked_room && linked_room.room_type === 'direct') {
      const update_result = await update_existing_room(
        input,
        canonical_participant,
      )
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
      canonical_participant,
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

  const created = await create_participant_and_direct_room(input)
  const bot_participant = await create_bot_participant(created.room.room_uuid)

  await debug_event({
    category: 'chat_room',
    event: 'participant_created',
    payload: {
      ...debug_identity_payload(input),
      participant_uuid: created.participant.participant_uuid,
      room_uuid: created.room.room_uuid,
    },
  })

  await debug_event({
    category: 'chat_room',
    event: 'room_created',
    payload: debug_participant_room_payload({
      participant_uuid: created.participant.participant_uuid,
      room_uuid: created.room.room_uuid,
      source_channel: input.channel,
    }),
  })

  return {
    room: normalize_room(
      created.room,
      created.participant,
      bot_participant,
      input,
    ),
    is_new_room: true,
  }
}
