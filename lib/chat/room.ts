import 'server-only'

import { supabase } from '@/lib/db/supabase'

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

async function find_participant_by_user(user_uuid: string) {
  const result = await supabase
    .from('participants')
    .select('participant_uuid, room_uuid, user_uuid, visitor_uuid, role')
    .eq('user_uuid', user_uuid)
    .eq('role', 'user')
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

async function find_participant_by_visitor(visitor_uuid: string) {
  const result = await supabase
    .from('participants')
    .select('participant_uuid, room_uuid, user_uuid, visitor_uuid, role')
    .eq('visitor_uuid', visitor_uuid)
    .eq('role', 'user')
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

async function load_room(room_uuid: string) {
  const result = await supabase
    .from('rooms')
    .select('room_uuid, room_type, status')
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

async function create_room(input: resolve_room_input) {
  const room_result = await supabase
    .from('rooms')
    .insert({
      room_type: 'direct',
      status: 'active',
    })
    .select('room_uuid, room_type, status')
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

export async function resolve_chat_room(
  input: resolve_room_input,
): Promise<{
  room: chat_room
  is_new_room: boolean
}> {
  const existing_by_user = input.user_uuid
    ? await find_participant_by_user(input.user_uuid)
    : null
  const existing_participant =
    existing_by_user ??
    await find_participant_by_visitor(input.visitor_uuid)

  if (existing_participant) {
    const result = await update_existing_room(input, existing_participant)
    const bot_participant = await resolve_bot_participant(
      result.room.room_uuid,
    )

    return {
      room: normalize_room(
        result.room,
        result.participant,
        bot_participant,
        input,
      ),
      is_new_room: false,
    }
  }

  const result = await create_room(input)
  const bot_participant = await create_bot_participant(result.room.room_uuid)

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
