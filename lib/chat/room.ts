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

async function select_user_participants(filter: {
  user_uuid?: string | null
  visitor_uuid: string
  guest_only?: boolean
}): Promise<participant_row[]> {
  let query = supabase
    .from('participants')
    .select('participant_uuid, room_uuid, user_uuid, visitor_uuid, role')
    .eq('role', 'user')

  if (filter.user_uuid) {
    query = query.eq('user_uuid', filter.user_uuid)
  } else if (filter.guest_only) {
    query = query
      .eq('visitor_uuid', filter.visitor_uuid)
      .is('user_uuid', null)
  } else {
    query = query.eq('visitor_uuid', filter.visitor_uuid)
  }

  const result = await query

  if (result.error) {
    throw result.error
  }

  return (result.data ?? []) as participant_row[]
}

async function list_user_participants_for_identity(
  input: resolve_room_input,
): Promise<participant_row[]> {
  if (input.user_uuid) {
    const by_user = await select_user_participants({
      user_uuid: input.user_uuid,
      visitor_uuid: input.visitor_uuid,
    })

    if (by_user.length > 0) {
      return by_user
    }

    const guest_for_visitor = await select_user_participants({
      visitor_uuid: input.visitor_uuid,
      guest_only: true,
    })

    if (guest_for_visitor.length > 0) {
      return guest_for_visitor
    }
  }

  return select_user_participants({
    visitor_uuid: input.visitor_uuid,
  })
}

async function resolve_latest_direct_room_for_identity(
  input: resolve_room_input,
): Promise<{ room: room_row; participant: participant_row } | null> {
  const participants = await list_user_participants_for_identity(input)

  if (participants.length === 0) {
    return null
  }

  const room_uuids = [...new Set(participants.map((row) => row.room_uuid))]

  const rooms_result = await supabase
    .from('rooms')
    .select('room_uuid, room_type, status, updated_at')
    .in('room_uuid', room_uuids)
    .eq('room_type', 'direct')

  if (rooms_result.error) {
    throw rooms_result.error
  }

  const direct_rooms = (rooms_result.data ?? []) as room_row[]

  if (direct_rooms.length === 0) {
    return null
  }

  direct_rooms.sort((a, b) => {
    const tb = new Date(b.updated_at ?? 0).getTime()
    const ta = new Date(a.updated_at ?? 0).getTime()
    return tb - ta
  })

  const room = direct_rooms[0]
  const participant = participants.find((row) => row.room_uuid === room.room_uuid)

  if (!participant) {
    return null
  }

  return { room, participant }
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

function is_closed_room_status(status: string | null) {
  if (!status) {
    return false
  }

  const normalized = status.toLowerCase()
  return normalized === 'closed' || normalized === 'inactive'
}

async function update_existing_room(
  input: resolve_room_input,
  participant: participant_row,
) {
  const room = await load_room(participant.room_uuid)

  if (!room) {
    throw new Error('Room not found for participant')
  }

  const was_closed = is_closed_room_status(room.status)

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
    was_closed,
  }
}

async function create_room(input: resolve_room_input) {
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

  const participant_result = await supabase
    .from('participants')
    .insert({
      room_uuid: room_result.data.room_uuid,
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
    room: room_result.data as room_row,
    participant: participant_result.data as participant_row,
  }
}

function room_debug_payload(input: {
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

export async function resolve_chat_room(
  input: resolve_room_input,
): Promise<{
  room: chat_room
  is_new_room: boolean
}> {
  await debug_event({
    category: 'chat_room',
    event: 'room_lookup_started',
    payload: {
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid ?? null,
      room_type: 'direct',
      source_channel: input.channel,
    },
  })

  const existing_direct = await resolve_latest_direct_room_for_identity(input)

  if (existing_direct) {
    const update_result = await update_existing_room(
      input,
      existing_direct.participant,
    )
    const bot_participant = await resolve_bot_participant(
      update_result.room.room_uuid,
    )

    const payload = room_debug_payload({
      participant_uuid: update_result.participant.participant_uuid,
      room_uuid: update_result.room.room_uuid,
      source_channel: input.channel,
    })

    if (update_result.was_closed) {
      await debug_event({
        category: 'chat_room',
        event: 'room_reopened',
        payload,
      })
    } else {
      await debug_event({
        category: 'chat_room',
        event: 'room_reused',
        payload,
      })
    }

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

  const result = await create_room(input)
  const bot_participant = await create_bot_participant(result.room.room_uuid)

  await debug_event({
    category: 'chat_room',
    event: 'room_created',
    payload: room_debug_payload({
      participant_uuid: result.participant.participant_uuid,
      room_uuid: result.room.room_uuid,
      source_channel: input.channel,
    }),
  })

  return {
    room: normalize_room(
      result.room,
      result.participant,
      bot_participant,
      input,
    ),
    is_new_room: true,
  }
}
