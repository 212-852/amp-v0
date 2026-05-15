import 'server-only'

import { control } from '@/lib/config/control'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'

import { participant_idle_status } from '@/lib/chat/participant/rules'
import { room_select_fields } from '@/lib/chat/room/schema'

export type chat_channel =
  | 'web'
  | 'line'
  | 'liff'
  | 'pwa'

export type room_mode = 'bot' | 'concierge'

export type chat_room = {
  room_uuid: string
  participant_uuid: string
  bot_participant_uuid: string
  user_uuid: string | null
  visitor_uuid: string | null
  channel: chat_channel
  last_incoming_channel: chat_channel | null
  mode: room_mode
}

export function parse_room_mode(value: string | null | undefined): room_mode {
  return value === 'concierge' ? 'concierge' : 'bot'
}

export type resolve_chat_room_outcome =
  | {
      ok: true
      room: chat_room
      is_new_room: boolean
    }
  | {
      ok: false
      room: chat_room
      is_new_room: false
    }

type resolve_room_input = {
  visitor_uuid: string | null
  user_uuid?: string | null
  channel: chat_channel
  external_room_id?: string | null
}

type room_row = {
  room_uuid: string
  room_type: string | null
  status: string | null
  mode: string | null
  action_id: string | null
  last_incoming_channel?: string | null
  last_incoming_at?: string | null
  created_at: string | null
  updated_at: string | null
}

type participant_row = {
  participant_uuid: string
  room_uuid: string | null
  user_uuid: string | null
  visitor_uuid: string | null
  role: string
  status: string | null
}

function is_unique_violation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = (error as { code?: string }).code

  return code === '23505'
}

function fallback_chat_room(input: resolve_room_input): chat_room {
  return {
    room_uuid: '',
    participant_uuid: '',
    bot_participant_uuid: '',
    user_uuid: clean_uuid(input.user_uuid),
    visitor_uuid: clean_uuid(input.visitor_uuid),
    channel: input.channel,
    last_incoming_channel: null,
    mode: 'bot',
  }
}

export function normalize_chat_channel(value: unknown): chat_channel | null {
  if (value === 'web' || value === 'line' || value === 'liff' || value === 'pwa') {
    return value
  }

  return null
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
    user_uuid:
      clean_uuid(input.user_uuid) ?? clean_uuid(participant.user_uuid),
    visitor_uuid:
      clean_uuid(input.visitor_uuid) ?? clean_uuid(participant.visitor_uuid),
    channel: input.channel,
    last_incoming_channel: normalize_chat_channel(row.last_incoming_channel),
    mode: parse_room_mode(row.mode),
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

function supabase_error_fields(error: unknown) {
  let json_message: string | null = null

  try {
    json_message = JSON.stringify(error)
  } catch {
    json_message = null
  }

  if (!error || typeof error !== 'object') {
    return {
      error_code: null as string | null,
      error_message: error ? String(error) : 'unknown_error',
      error_details: null as string | null,
      error_hint: null as string | null,
      error_json: json_message,
    }
  }

  const e = error as {
    code?: unknown
    message?: unknown
    details?: unknown
    hint?: unknown
  }
  const error_message =
    typeof e.message === 'string' && e.message.trim()
      ? e.message
      : json_message && json_message !== '{}'
        ? json_message
        : String(error)

  return {
    error_code: typeof e.code === 'string' ? e.code : null,
    error_message,
    error_details: typeof e.details === 'string' ? e.details : null,
    error_hint: typeof e.hint === 'string' ? e.hint : null,
    error_json: json_message,
  }
}

function snapshot_error_for_log(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>

    return {
      ...e,
      message: e.message,
      code: e.code,
      details: e.details,
      hint: e.hint,
    }
  }

  return { value: String(error) }
}

async function debug_chat_room(
  event: string,
  payload: Record<string, unknown>,
) {
  const normalized =
    payload.error !== undefined ? supabase_error_fields(payload.error) : {}
  const log_record = {
    ...payload,
    ...normalized,
    error:
      payload.error !== undefined
        ? snapshot_error_for_log(payload.error)
        : undefined,
  }

  console.error('[chat_room]', event, JSON.stringify(log_record, null, 2))
}

/** participants table: never include room_type in select/insert/update lists. */
const PARTICIPANT_DB_SELECT =
  'participant_uuid, room_uuid, user_uuid, visitor_uuid, role, status'

function build_user_participant_insert_row(
  input: resolve_room_input,
  room_uuid: string,
  updated_at_iso: string,
) {
  const sanitized_room_uuid = clean_uuid(room_uuid)
  const sanitized_user_uuid = clean_uuid(input.user_uuid)
  const sanitized_visitor_uuid = clean_uuid(input.visitor_uuid)

  return {
    role: 'user' as const,
    status: participant_idle_status,
    last_channel: input.channel,
    updated_at: updated_at_iso,
    ...(sanitized_room_uuid ? { room_uuid: sanitized_room_uuid } : {}),
    ...(sanitized_user_uuid ? { user_uuid: sanitized_user_uuid } : {}),
    ...(sanitized_visitor_uuid
      ? { visitor_uuid: sanitized_visitor_uuid }
      : {}),
  }
}

function build_user_participant_touch_update(
  input: resolve_room_input,
  updated_at_iso: string,
) {
  const sanitized_user_uuid = clean_uuid(input.user_uuid)
  const sanitized_visitor_uuid = clean_uuid(input.visitor_uuid)

  return {
    last_channel: input.channel,
    updated_at: updated_at_iso,
    ...(sanitized_user_uuid ? { user_uuid: sanitized_user_uuid } : {}),
    ...(sanitized_visitor_uuid
      ? { visitor_uuid: sanitized_visitor_uuid }
      : {}),
  }
}

function build_user_participant_move_update(
  input: resolve_room_input,
  new_room_uuid: string,
  updated_at_iso: string,
) {
  const sanitized_room_uuid = clean_uuid(new_room_uuid)
  const sanitized_user_uuid = clean_uuid(input.user_uuid)
  const sanitized_visitor_uuid = clean_uuid(input.visitor_uuid)

  return {
    last_channel: input.channel,
    updated_at: updated_at_iso,
    ...(sanitized_room_uuid ? { room_uuid: sanitized_room_uuid } : {}),
    ...(sanitized_user_uuid ? { user_uuid: sanitized_user_uuid } : {}),
    ...(sanitized_visitor_uuid
      ? { visitor_uuid: sanitized_visitor_uuid }
      : {}),
  }
}

function build_bot_participant_insert_row(room_uuid: string) {
  const sanitized_room_uuid = clean_uuid(room_uuid)

  return {
    role: 'bot' as const,
    status: participant_idle_status,
    ...(sanitized_room_uuid ? { room_uuid: sanitized_room_uuid } : {}),
  }
}

async function find_user_participant_by_user(user_uuid: string) {
  await debug_event({
    category: 'chat_room',
    event: 'chat_room_participant_lookup_started',
    payload: {
      user_uuid,
      visitor_uuid: null,
      room_uuid: null,
      participant_uuid: null,
      source_channel: null,
      reason: 'find_user_participant_by_user',
    },
  })

  const result = await supabase
    .from('participants')
    .select(PARTICIPANT_DB_SELECT)
    .eq('role', 'user')
    .eq('user_uuid', user_uuid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    await debug_event({
      category: 'chat_room',
      event: 'chat_room_participant_lookup_failed',
      payload: {
        user_uuid,
        visitor_uuid: null,
        room_uuid: null,
        participant_uuid: null,
        source_channel: null,
        reason: 'find_user_participant_by_user',
        ...supabase_error_fields(result.error),
      },
    })

    throw result.error
  }

  await debug_event({
    category: 'chat_room',
    event: 'chat_room_participant_lookup_succeeded',
    payload: {
      user_uuid,
      visitor_uuid: null,
      room_uuid: result.data?.room_uuid ?? null,
      participant_uuid: result.data?.participant_uuid ?? null,
      source_channel: null,
      reason: 'find_user_participant_by_user',
    },
  })

  return result.data ? (result.data as participant_row) : null
}

async function find_user_participant_by_visitor(visitor_uuid: string) {
  await debug_event({
    category: 'chat_room',
    event: 'chat_room_participant_lookup_started',
    payload: {
      user_uuid: null,
      visitor_uuid,
      room_uuid: null,
      participant_uuid: null,
      source_channel: null,
      reason: 'find_user_participant_by_visitor',
    },
  })

  const result = await supabase
    .from('participants')
    .select(PARTICIPANT_DB_SELECT)
    .eq('role', 'user')
    .eq('visitor_uuid', visitor_uuid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    await debug_event({
      category: 'chat_room',
      event: 'chat_room_participant_lookup_failed',
      payload: {
        user_uuid: null,
        visitor_uuid,
        room_uuid: null,
        participant_uuid: null,
        source_channel: null,
        reason: 'find_user_participant_by_visitor',
        ...supabase_error_fields(result.error),
      },
    })

    throw result.error
  }

  await debug_event({
    category: 'chat_room',
    event: 'chat_room_participant_lookup_succeeded',
    payload: {
      user_uuid: null,
      visitor_uuid,
      room_uuid: result.data?.room_uuid ?? null,
      participant_uuid: result.data?.participant_uuid ?? null,
      source_channel: null,
      reason: 'find_user_participant_by_visitor',
    },
  })

  return result.data ? (result.data as participant_row) : null
}

async function find_canonical_user_participant(
  input: resolve_room_input,
): Promise<participant_row | null> {
  if (input.user_uuid) {
    const by_user = await find_user_participant_by_user(input.user_uuid)

    if (by_user) {
      return by_user
    }
  }

  if (!input.visitor_uuid) {
    return null
  }

  return find_user_participant_by_visitor(input.visitor_uuid)
}

async function find_canonical_user_participant_after_insert_conflict(
  input: resolve_room_input,
): Promise<participant_row | null> {
  const max_attempts = 12

  for (let attempt = 1; attempt <= max_attempts; attempt += 1) {
    const existing = await find_canonical_user_participant(input)

    if (existing) {
      return existing
    }

    if (attempt < max_attempts) {
      await new Promise((resolve) => setTimeout(resolve, 60 * attempt))
    }
  }

  return null
}

export async function load_room_row(room_uuid: string) {
  const result = await supabase
    .from('rooms')
    .select(room_select_fields)
    .eq('room_uuid', room_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data as room_row | null
}

async function load_room_row_with_retry(
  room_uuid: string,
  max_attempts = 6,
): Promise<room_row | null> {
  let last: room_row | null = null

  for (let attempt = 1; attempt <= max_attempts; attempt += 1) {
    last = await load_room_row(room_uuid)

    if (last) {
      return last
    }

    if (attempt < max_attempts) {
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt))
    }
  }

  return last
}

async function delete_orphan_direct_room(room_uuid: string) {
  const result = await supabase
    .from('rooms')
    .delete()
    .eq('room_uuid', room_uuid)

  if (result.error) {
    throw result.error
  }
}

type direct_room_insert_result = {
  room: room_row
  created: boolean
}

async function insert_direct_room_row(
  input: resolve_room_input,
  identity: ReturnType<typeof debug_identity_payload>,
): Promise<direct_room_insert_result> {
  const now = new Date().toISOString()
  await debug_event({
    category: 'chat_room',
    event: 'chat_room_create_started',
    payload: {
      ...identity,
      room_uuid: null,
      participant_uuid: null,
      reason: 'insert_direct_room_row',
    },
  })

  const room_result = await supabase
    .from('rooms')
    .insert({
      room_type: 'direct',
      status: 'active',
      updated_at: now,
      last_incoming_channel: input.channel,
      last_incoming_at: now,
      mode: 'bot',
    })
    .select(room_select_fields)
    .single()

  if (room_result.error && !is_unique_violation(room_result.error)) {
    await debug_event({
      category: 'chat_room',
      event: 'chat_room_create_failed',
      payload: {
        ...identity,
        room_uuid: null,
        participant_uuid: null,
        reason: 'insert_direct_room_row',
        ...supabase_error_fields(room_result.error),
      },
    })

    throw room_result.error
  }

  if (is_unique_violation(room_result.error)) {
    const existing_participant =
      await find_canonical_user_participant(input)

    if (!existing_participant?.room_uuid) {
      await debug_event({
        category: 'chat_room',
        event: 'chat_room_create_failed',
        payload: {
          ...identity,
          room_uuid: null,
          participant_uuid: existing_participant?.participant_uuid ?? null,
          reason: 'insert_direct_room_unique_without_participant_room',
          ...supabase_error_fields(room_result.error),
        },
      })

      throw room_result.error
    }

    const existing_room = await load_room_row(existing_participant.room_uuid)

    if (!existing_room) {
      await debug_event({
        category: 'chat_room',
        event: 'chat_room_create_failed',
        payload: {
          ...identity,
          room_uuid: existing_participant.room_uuid,
          participant_uuid: existing_participant.participant_uuid,
          reason: 'insert_direct_room_unique_existing_room_missing',
          ...supabase_error_fields(room_result.error),
        },
      })

      throw room_result.error
    }

    return {
      room: existing_room,
      created: false,
    }
  }

  const inserted = room_result.data as room_row | null

  if (!inserted?.room_uuid) {
    await debug_event({
      category: 'chat_room',
      event: 'chat_room_create_failed',
      payload: {
        ...identity,
        room_uuid: null,
        participant_uuid: null,
        reason: 'insert_direct_room_no_row_returned',
        error_code: 'no_room_row',
        error_message: 'insert_direct_room_row returned no room_uuid',
        error_details: null,
        error_hint: null,
      },
    })

    throw new Error('insert_direct_room_row: no row returned')
  }

  await debug_event({
    category: 'chat_room',
    event: 'chat_room_create_succeeded',
    payload: {
      ...identity,
      room_uuid: inserted.room_uuid,
      participant_uuid: null,
      reason: 'insert_direct_room_row',
    },
  })

  return {
    room: inserted,
    created: true,
  }
}

async function touch_room_row(room_uuid: string) {
  const now = new Date().toISOString()
  const room_result = await supabase
    .from('rooms')
    .update({
      updated_at: now,
      status: 'active',
    })
    .eq('room_uuid', room_uuid)

  if (room_result.error) {
    throw room_result.error
  }
}

export async function update_room_last_incoming_channel(input: {
  room_uuid: string
  channel: chat_channel
  message_uuid?: string | null
  sender_role?: string | null
}) {
  const now = new Date().toISOString()
  const result = await supabase
    .from('rooms')
    .update({
      last_incoming_channel: input.channel,
      last_incoming_at: now,
      updated_at: now,
      status: 'active',
    })
    .eq('room_uuid', input.room_uuid)

  const payload = {
    room_uuid: input.room_uuid,
    message_uuid: input.message_uuid ?? null,
    last_incoming_channel: input.channel,
    selected_output_channel: null,
    sender_role: input.sender_role ?? 'user',
    receiver_user_uuid: null,
    receiver_participant_uuid: null,
    error_code: result.error ? result.error.code : null,
    error_message: result.error ? result.error.message : null,
  }

  await debug_event({
    category: 'chat_message',
    event: 'room_last_incoming_channel_updated',
    payload,
  })

  if (result.error) {
    throw result.error
  }
}

async function update_user_participant_identity(input: {
  participant_uuid: string
  user_uuid: string
  visitor_uuid?: string
  room_uuid?: string | null
  channel: chat_channel
}) {
  const now = new Date().toISOString()
  const update = {
    user_uuid: input.user_uuid,
    last_channel: input.channel,
    updated_at: now,
    ...(input.visitor_uuid ? { visitor_uuid: input.visitor_uuid } : {}),
    ...(input.room_uuid ? { room_uuid: input.room_uuid } : {}),
  }
  const result = await supabase
    .from('participants')
    .update(update)
    .eq('participant_uuid', input.participant_uuid)
    .select(PARTICIPANT_DB_SELECT)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  if (!result.data) {
    throw new Error('update_user_participant_identity: no row returned')
  }

  return result.data as participant_row
}

async function move_room_messages(input: {
  from_room_uuid: string
  to_room_uuid: string
}) {
  if (input.from_room_uuid === input.to_room_uuid) {
    return 0
  }

  const result = await supabase
    .from('messages')
    .update({
      room_uuid: input.to_room_uuid,
    })
    .eq('room_uuid', input.from_room_uuid)
    .select('message_uuid')

  if (result.error) {
    throw result.error
  }

  return result.data?.length ?? 0
}

async function move_participants_to_room(input: {
  from_room_uuid: string
  to_room_uuid: string
}) {
  if (input.from_room_uuid === input.to_room_uuid) {
    return
  }

  const result = await supabase
    .from('participants')
    .update({
      room_uuid: input.to_room_uuid,
      updated_at: new Date().toISOString(),
    })
    .eq('room_uuid', input.from_room_uuid)

  if (result.error) {
    throw result.error
  }
}

async function close_duplicate_room(room_uuid: string) {
  const result = await supabase
    .from('rooms')
    .update({
      status: 'inactive',
      updated_at: new Date().toISOString(),
    })
    .eq('room_uuid', room_uuid)

  if (result.error) {
    throw result.error
  }
}

async function merge_identity_rooms(
  input: resolve_room_input,
): Promise<participant_row | null> {
  const user_uuid = input.user_uuid

  if (!user_uuid) {
    return null
  }

  if (!input.visitor_uuid) {
    return find_user_participant_by_user(user_uuid)
  }

  const visitor_participant =
    await find_user_participant_by_visitor(input.visitor_uuid)
  const user_participant =
    await find_user_participant_by_user(user_uuid)

  if (visitor_participant && !user_participant) {
    try {
      const promoted = await update_user_participant_identity({
        participant_uuid: visitor_participant.participant_uuid,
        user_uuid,
        visitor_uuid: input.visitor_uuid,
        channel: input.channel,
      })

      return promoted
    } catch (error) {
      if (!is_unique_violation(error)) {
        throw error
      }

      const after_conflict = await find_user_participant_by_user(user_uuid)

      if (after_conflict) {
        return after_conflict
      }

      throw error
    }
  }

  if (!visitor_participant && user_participant) {
    const updated = await update_user_participant_identity({
      participant_uuid: user_participant.participant_uuid,
      user_uuid,
      visitor_uuid: input.visitor_uuid,
      channel: input.channel,
    })

    return updated
  }

  if (!visitor_participant || !user_participant) {
    return null
  }

  if (
    visitor_participant.participant_uuid ===
      user_participant.participant_uuid ||
    visitor_participant.room_uuid === user_participant.room_uuid
  ) {
    const updated = await update_user_participant_identity({
      participant_uuid: user_participant.participant_uuid,
      user_uuid,
      visitor_uuid:
        visitor_participant.participant_uuid ===
        user_participant.participant_uuid
          ? input.visitor_uuid
          : undefined,
      channel: input.channel,
    })

    return updated
  }

  if (!user_participant.room_uuid) {
    if (
      visitor_participant?.room_uuid &&
      visitor_participant.participant_uuid !== user_participant.participant_uuid
    ) {
      const promoted = await update_user_participant_identity({
        participant_uuid: visitor_participant.participant_uuid,
        user_uuid,
        visitor_uuid: input.visitor_uuid,
        channel: input.channel,
      })
      const orphan_delete = await supabase
        .from('participants')
        .delete()
        .eq('participant_uuid', user_participant.participant_uuid)
        .eq('role', 'user')

      if (orphan_delete.error) {
        throw orphan_delete.error
      }

      return promoted
    }

    return user_participant
  }

  if (visitor_participant.room_uuid) {
    await move_room_messages({
      from_room_uuid: visitor_participant.room_uuid,
      to_room_uuid: user_participant.room_uuid,
    })

    await move_participants_to_room({
      from_room_uuid: visitor_participant.room_uuid,
      to_room_uuid: user_participant.room_uuid,
    })

    await close_duplicate_room(visitor_participant.room_uuid)
  }

  const canonical = await update_user_participant_identity({
    participant_uuid: user_participant.participant_uuid,
    user_uuid,
    room_uuid: user_participant.room_uuid,
    channel: input.channel,
  })

  return canonical
}

type create_attempt =
  | {
      tag: 'fresh'
      room: room_row
      participant: participant_row
      is_new_room: boolean
    }
  | { tag: 'reuse'; participant: participant_row }

async function try_insert_participant_and_direct_room(
  input: resolve_room_input,
  identity: ReturnType<typeof debug_identity_payload>,
): Promise<create_attempt> {
  const room_result = await insert_direct_room_row(input, identity)
  const room = room_result.room
  const now = new Date().toISOString()
  await debug_event({
    category: 'chat_room',
    event: 'chat_room_participant_create_started',
    payload: {
      ...identity,
      room_uuid: room.room_uuid,
      participant_uuid: null,
      reason: 'insert_user_participant',
    },
  })

  const participant_result = await supabase
    .from('participants')
    .insert(build_user_participant_insert_row(input, room.room_uuid, now))
    .select(PARTICIPANT_DB_SELECT)
    .single()

  if (!participant_result.error && participant_result.data) {
    await touch_room_row(room.room_uuid)
    await debug_event({
      category: 'chat_room',
      event: 'chat_room_participant_create_succeeded',
      payload: {
        ...identity,
        room_uuid: room.room_uuid,
        participant_uuid: participant_result.data.participant_uuid,
        reason: 'insert_user_participant',
      },
    })

    return {
      tag: 'fresh',
      room,
      participant: participant_result.data as participant_row,
      is_new_room: room_result.created,
    }
  }

  if (!is_unique_violation(participant_result.error)) {
    await delete_orphan_direct_room(room.room_uuid)
    await debug_event({
      category: 'chat_room',
      event: 'chat_room_participant_create_failed',
      payload: {
        ...identity,
        room_uuid: room.room_uuid,
        participant_uuid: null,
        reason: 'insert_user_participant',
        ...supabase_error_fields(participant_result.error),
      },
    })

    throw participant_result.error
  }

  const existing =
    await find_canonical_user_participant_after_insert_conflict(input)

  await delete_orphan_direct_room(room.room_uuid)

  if (!existing) {
    await debug_event({
      category: 'chat_room',
      event: 'chat_room_participant_create_failed',
      payload: {
        ...identity,
        room_uuid: room.room_uuid,
        participant_uuid: null,
        reason: 'insert_user_participant_unique_without_existing',
        ...supabase_error_fields(participant_result.error),
      },
    })

    throw participant_result.error
  }

  return { tag: 'reuse', participant: existing }
}

async function touch_direct_participant_and_room(
  input: resolve_room_input,
  participant: participant_row,
  room: room_row,
) {
  const now = new Date().toISOString()
  const participant_result = await supabase
    .from('participants')
    .update(build_user_participant_touch_update(input, now))
    .eq('participant_uuid', participant.participant_uuid)
    .select(PARTICIPANT_DB_SELECT)
    .maybeSingle()

  if (participant_result.error) {
    throw participant_result.error
  }

  if (!participant_result.data) {
    throw new Error('touch_direct_participant: update returned no row')
  }

  const room_result = await supabase
    .from('rooms')
    .update({
      status: 'active',
      updated_at: now,
      last_incoming_channel: input.channel,
      last_incoming_at: now,
    })
    .eq('room_uuid', room.room_uuid)

  if (room_result.error) {
    throw room_result.error
  }

  const refreshed_room = await load_room_row(room.room_uuid)

  if (!refreshed_room) {
    throw new Error('touch_direct_participant: room missing after update')
  }

  return {
    participant: participant_result.data as participant_row,
    room: refreshed_room,
  }
}

async function assign_participant_to_direct_room(
  input: resolve_room_input,
  participant: participant_row,
  identity: ReturnType<typeof debug_identity_payload>,
): Promise<{
  room: room_row
  participant: participant_row
  is_new_room: boolean
}> {
  if (participant.room_uuid) {
    const existing_room = await load_room_row(participant.room_uuid)

    if (existing_room?.room_type === 'direct') {
      return {
        room: existing_room,
        participant,
        is_new_room: false,
      }
    }
  }

  const new_room_result = await insert_direct_room_row(input, identity)
  const new_room = new_room_result.room
  const now = new Date().toISOString()

  let participant_update = supabase
    .from('participants')
    .update(
      build_user_participant_move_update(
        input,
        new_room.room_uuid,
        now,
      ),
    )
    .eq('participant_uuid', participant.participant_uuid)

  if (participant.room_uuid) {
    participant_update = participant_update.eq(
      'room_uuid',
      participant.room_uuid,
    )
  } else {
    participant_update = participant_update.is('room_uuid', null)
  }
  const participant_result = await participant_update
    .select(PARTICIPANT_DB_SELECT)
    .maybeSingle()

  if (participant_result.error) {
    await delete_orphan_direct_room(new_room.room_uuid)
    throw participant_result.error
  }

  if (!participant_result.data) {
    await delete_orphan_direct_room(new_room.room_uuid)

    const reused_participant =
      await find_canonical_user_participant(input)

    if (reused_participant?.room_uuid) {
      const reused_room = await load_room_row(reused_participant.room_uuid)

      if (reused_room?.room_type === 'direct') {
        return {
          room: reused_room,
          participant: reused_participant,
          is_new_room: false,
        }
      }
    }

    throw new Error('move_participant: update returned no row')
  }

  await touch_room_row(new_room.room_uuid)

  const final_room = await load_room_row(new_room.room_uuid)

  if (!final_room) {
    throw new Error('move_participant: new room not found')
  }

  return {
    room: final_room,
    participant: participant_result.data as participant_row,
    is_new_room: new_room_result.created,
  }
}

async function find_bot_participant(room_uuid: string) {
  const result = await supabase
    .from('participants')
    .select(PARTICIPANT_DB_SELECT)
    .eq('room_uuid', room_uuid ?? null)
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
    .insert(build_bot_participant_insert_row(room_uuid))
    .select(PARTICIPANT_DB_SELECT)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  if (!result.data) {
    throw new Error('create_bot_participant: insert returned no row')
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

/**
 * Idempotent: one direct active room, user participant (by visitor/user), and bot.
 * Run immediately after a new visitor row is created so the first room resolve sees data.
 */
export async function ensure_direct_room_for_visitor(
  input: resolve_room_input,
): Promise<void> {
  const identity = debug_identity_payload(input)

  try {
    const merged_participant = await merge_identity_rooms(input)
    const canonical_participant =
      merged_participant ?? (await find_canonical_user_participant(input))

    if (canonical_participant?.room_uuid) {
      const room = await load_room_row(canonical_participant.room_uuid)

      if (
        room &&
        room.room_type === 'direct' &&
        room.status !== 'inactive'
      ) {
        try {
          await resolve_bot_participant(room.room_uuid)
        } catch {
          /* resolve_chat_room will ensure bot */
        }

        return
      }
    }

    const created = await try_insert_participant_and_direct_room(
      input,
      identity,
    )

    if (created.tag === 'fresh') {
      await resolve_bot_participant(created.room.room_uuid)
    }
  } catch (error) {
    console.error(
      '[ensure_direct_room_for_visitor]',
      snapshot_error_for_log(error),
    )
  }
}

async function finish_with_bot(
  input: resolve_room_input,
  identity: ReturnType<typeof debug_identity_payload>,
  room: room_row,
  participant: participant_row,
  is_new_room: boolean,
): Promise<resolve_chat_room_outcome> {
  let bot_participant: participant_row

  try {
    bot_participant = await resolve_bot_participant(room.room_uuid)

    if (control.debug.chat_room) {
      await debug_event({
        category: 'chat_room',
        event: 'bot_participant_ensured',
        payload: {
          ...identity,
          room_uuid: room.room_uuid,
          bot_participant_uuid: bot_participant.participant_uuid,
        },
      })
    }
  } catch (error) {
    const err_fields = supabase_error_fields(error)
    await debug_chat_room('room_failed', {
      ...identity,
      ...err_fields,
      phase: 'resolve_bot_participant',
      room_uuid: room.room_uuid,
    })

    return {
      ok: false,
      room: fallback_chat_room(input),
      is_new_room: false,
    }
  }

  return {
    ok: true,
    room: normalize_room(
      room,
      participant,
      bot_participant,
      input,
    ),
    is_new_room,
  }
}

async function handle_existing_participant(
  input: resolve_room_input,
  identity: ReturnType<typeof debug_identity_payload>,
  participant: participant_row,
): Promise<resolve_chat_room_outcome> {
  if (!participant.room_uuid) {
    const assigned = await assign_participant_to_direct_room(
      input,
      participant,
      identity,
    )

    return finish_with_bot(
      input,
      identity,
      assigned.room,
      assigned.participant,
      assigned.is_new_room,
    )
  }

  const room = await load_room_row(participant.room_uuid)

  if (!room) {
    await debug_chat_room('participant_lookup_empty', {
      ...identity,
      participant_uuid: participant.participant_uuid,
      room_uuid: participant.room_uuid,
    })

    await debug_chat_room('participant_failed', {
      ...identity,
      ...supabase_error_fields(new Error('room not found for participant')),
      phase: 'load_room',
    })

    return {
      ok: false,
      room: fallback_chat_room(input),
      is_new_room: false,
    }
  }

  if (room.room_type === 'direct') {
    const touched = await touch_direct_participant_and_room(
      input,
      participant,
      room,
    )

    if (control.debug.chat_room) {
      await debug_event({
        category: 'chat_room',
        event: 'participant_reused',
        payload: {
          ...identity,
          participant_uuid: touched.participant.participant_uuid,
          room_uuid: touched.room.room_uuid,
        },
      })

      await debug_event({
        category: 'chat_room',
        event: 'room_reused',
        payload: debug_participant_room_payload({
          participant_uuid: touched.participant.participant_uuid,
          room_uuid: touched.room.room_uuid,
          source_channel: input.channel,
        }),
      })
    }

    return finish_with_bot(
      input,
      identity,
      touched.room,
      touched.participant,
      false,
    )
  }

  const moved = await assign_participant_to_direct_room(
    input,
    participant,
    identity,
  )

  if (control.debug.chat_room) {
    await debug_event({
      category: 'chat_room',
      event: 'participant_reused',
      payload: {
        ...identity,
        participant_uuid: moved.participant.participant_uuid,
        room_uuid: moved.room.room_uuid,
        note: 'moved_to_new_direct_room',
      },
    })

    await debug_event({
      category: 'chat_room',
      event: 'room_created',
      payload: debug_participant_room_payload({
        participant_uuid: moved.participant.participant_uuid,
        room_uuid: moved.room.room_uuid,
        source_channel: input.channel,
      }),
    })
  }

  return finish_with_bot(
    input,
    identity,
    moved.room,
    moved.participant,
    moved.is_new_room,
  )
}

export async function resolve_chat_room(
  raw_input: resolve_room_input,
): Promise<resolve_chat_room_outcome> {
  const input: resolve_room_input = {
    ...raw_input,
    visitor_uuid: clean_uuid(raw_input.visitor_uuid),
    user_uuid: clean_uuid(raw_input.user_uuid),
  }
  const identity = debug_identity_payload(input)

  try {
    if (control.debug.chat_room) {
      await debug_event({
        category: 'chat_room',
        event: 'participant_lookup_started',
        payload: identity,
      })
    }

    const merged_participant = await merge_identity_rooms(input)
    const canonical_participant =
      merged_participant ??
      (await find_canonical_user_participant(input))

    const external_room_id = input.external_room_id?.trim() ?? null

    if (external_room_id) {
      if (!canonical_participant?.room_uuid) {
        return {
          ok: false,
          room: fallback_chat_room(input),
          is_new_room: false,
        }
      }

      if (canonical_participant.room_uuid !== external_room_id) {
        return {
          ok: false,
          room: fallback_chat_room(input),
          is_new_room: false,
        }
      }

      const pinned_room = await load_room_row(external_room_id)

      if (
        !pinned_room ||
        pinned_room.room_type !== 'direct' ||
        pinned_room.status === 'inactive'
      ) {
        return {
          ok: false,
          room: fallback_chat_room(input),
          is_new_room: false,
        }
      }
    }

    if (control.debug.chat_room) {
      await debug_event({
        category: 'chat_room',
        event: 'room_lookup_result',
        payload: {
          ...identity,
          found: Boolean(canonical_participant),
          participant_uuid: canonical_participant?.participant_uuid ?? null,
          room_uuid: canonical_participant?.room_uuid ?? null,
        },
      })
    }

    if (!canonical_participant) {
      const looked_up =
        (input.user_uuid
          ? await find_user_participant_by_user(input.user_uuid)
          : null) ??
        (input.visitor_uuid
          ? await find_user_participant_by_visitor(input.visitor_uuid)
          : null)

      if (looked_up) {
        return handle_existing_participant(input, identity, looked_up)
      }

      const created = await try_insert_participant_and_direct_room(
        input,
        identity,
      )

      if (created.tag === 'reuse') {
        return handle_existing_participant(
          input,
          identity,
          created.participant,
        )
      }

      if (control.debug.chat_room) {
        await debug_event({
          category: 'chat_room',
          event: 'participant_created',
          payload: {
            ...identity,
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
      }

      const linked_room = await load_room_row_with_retry(
        created.room.room_uuid,
      )

      if (!linked_room) {
        await debug_chat_room('participant_failed', {
          ...identity,
          ...supabase_error_fields(new Error('room missing after create')),
          phase: 'post_create_load_room',
        })

        return {
          ok: false,
          room: fallback_chat_room(input),
          is_new_room: false,
        }
      }

      return finish_with_bot(
        input,
        identity,
        linked_room,
        created.participant,
        created.is_new_room,
      )
    }

    return handle_existing_participant(
      input,
      identity,
      canonical_participant,
    )
  } catch (error) {
    const err_fields = supabase_error_fields(error)
    await debug_chat_room('participant_failed', {
      ...identity,
      ...err_fields,
      phase: 'resolve_chat_room',
    })

    return {
      ok: false,
      room: fallback_chat_room(input),
      is_new_room: false,
    }
  }
}

export type admin_reception_send_resolve_error =
  | 'room_not_found'
  | 'user_missing'
  | 'bot_missing'
  | 'staff_missing'

export type admin_reception_send_resolve_ok = {
  room_uuid: string
  user_participant_uuid: string
  user_uuid: string | null
  bot_participant_uuid: string
  staff_participant_uuid: string
  staff_sender_role: 'admin' | 'concierge'
  last_incoming_channel: chat_channel | null
}

async function ensure_staff_participant(input: {
  room_uuid: string
  staff_user_uuid: string
  staff_sender_role: 'admin' | 'concierge'
}) {
  const existing = await supabase
    .from('participants')
    .select('participant_uuid')
    .eq('room_uuid', input.room_uuid)
    .eq('role', input.staff_sender_role)
    .eq('user_uuid', input.staff_user_uuid)
    .maybeSingle()

  if (existing.error) {
    throw existing.error
  }

  const existing_uuid = clean_uuid(
    (existing.data as { participant_uuid?: string } | null)
      ?.participant_uuid ?? null,
  )

  if (existing_uuid) {
    return existing_uuid
  }

  const inserted = await supabase
    .from('participants')
    .insert({
      room_uuid: input.room_uuid,
      user_uuid: input.staff_user_uuid,
      role: input.staff_sender_role,
      status: participant_idle_status,
      last_channel: 'web',
    })
    .select('participant_uuid')
    .maybeSingle()

  if (inserted.error) {
    if (!is_unique_violation(inserted.error)) {
      throw inserted.error
    }

    const after_conflict = await supabase
      .from('participants')
      .select('participant_uuid')
      .eq('room_uuid', input.room_uuid)
      .eq('role', input.staff_sender_role)
      .eq('user_uuid', input.staff_user_uuid)
      .maybeSingle()

    if (after_conflict.error) {
      throw after_conflict.error
    }

    const conflict_uuid = clean_uuid(
      (after_conflict.data as { participant_uuid?: string } | null)
        ?.participant_uuid ?? null,
    )

    if (conflict_uuid) {
      return conflict_uuid
    }
  }

  const inserted_uuid = clean_uuid(
    (inserted.data as { participant_uuid?: string } | null)
      ?.participant_uuid ?? null,
  )

  if (!inserted_uuid) {
    throw new Error('ensure_staff_participant: insert returned no row')
  }

  return inserted_uuid
}

export async function resolve_admin_reception_send_context(input: {
  room_uuid: string
  staff_user_uuid: string
}): Promise<
  | { ok: true; data: admin_reception_send_resolve_ok }
  | { ok: false; error: admin_reception_send_resolve_error }
> {
  const room_uuid = clean_uuid(input.room_uuid)
  const staff_user_uuid = clean_uuid(input.staff_user_uuid)

  if (!room_uuid || !staff_user_uuid) {
    return { ok: false, error: 'room_not_found' }
  }

  const room_result = await supabase
    .from('rooms')
    .select('room_uuid, mode, last_incoming_channel')
    .eq('room_uuid', room_uuid)
    .maybeSingle()

  if (room_result.error) {
    throw room_result.error
  }

  if (!room_result.data?.room_uuid) {
    return { ok: false, error: 'room_not_found' }
  }

  const staff_sender_role: 'admin' | 'concierge' =
    parse_room_mode(room_result.data.mode) === 'concierge'
      ? 'concierge'
      : 'admin'

  const [user_result, bot_result, staff_result] = await Promise.all([
    supabase
      .from('participants')
      .select('participant_uuid, user_uuid, last_channel')
      .eq('room_uuid', room_uuid)
      .eq('role', 'user')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('participants')
      .select('participant_uuid')
      .eq('room_uuid', room_uuid)
      .eq('role', 'bot')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('participants')
      .select('participant_uuid')
      .eq('room_uuid', room_uuid)
      .eq('role', staff_sender_role)
      .eq('user_uuid', staff_user_uuid)
      .maybeSingle(),
  ])

  if (user_result.error) {
    throw user_result.error
  }

  if (bot_result.error) {
    throw bot_result.error
  }

  if (staff_result.error) {
    throw staff_result.error
  }

  const user_participant_uuid = clean_uuid(
    (user_result.data as { participant_uuid?: string } | null)
      ?.participant_uuid ?? null,
  )
  const user_uuid = clean_uuid(
    (user_result.data as { user_uuid?: string | null } | null)?.user_uuid ??
      null,
  )
  const user_last_channel = normalize_chat_channel(
    (user_result.data as { last_channel?: unknown } | null)?.last_channel,
  )
  const bot_participant_uuid = clean_uuid(
    (bot_result.data as { participant_uuid?: string } | null)
      ?.participant_uuid ?? null,
  )
  const staff_participant_uuid = clean_uuid(
    (staff_result.data as { participant_uuid?: string } | null)
      ?.participant_uuid ?? null,
  )

  if (!user_participant_uuid) {
    return { ok: false, error: 'user_missing' }
  }

  if (!bot_participant_uuid) {
    return { ok: false, error: 'bot_missing' }
  }

  const ensured_staff_participant_uuid =
    staff_participant_uuid ||
    (await ensure_staff_participant({
      room_uuid,
      staff_user_uuid,
      staff_sender_role,
    }))

  return {
    ok: true,
    data: {
      room_uuid,
      user_participant_uuid,
      user_uuid,
      bot_participant_uuid,
      staff_participant_uuid: ensured_staff_participant_uuid,
      staff_sender_role,
      last_incoming_channel: normalize_chat_channel(
        (room_result.data as { last_incoming_channel?: unknown })
          .last_incoming_channel,
      ) ?? user_last_channel,
    },
  }
}

async function emit_chat_room_resolve_event(
  event: string,
  payload: Record<string, unknown>,
) {
  await debug_event({
    category: 'chat_room',
    event,
    payload,
  })
}

export type resolve_user_room_ok = {
  ok: true
  room_uuid: string
  participant_uuid: string
  bot_participant_uuid: string
  last_incoming_channel: chat_channel | null
  mode: room_mode
  channel: chat_channel
  is_new_room: boolean
  selected_source:
    | 'user_participant'
    | 'visitor_participant'
    | 'created_participant'
}

export type resolve_user_room_outcome =
  | resolve_user_room_ok
  | {
      ok: false
      reason: string
      room_uuid: null
      participant_uuid: null
      error_code?: string | null
      error_message?: string | null
      error_details?: string | null
      error_hint?: string | null
    }

async function complete_resolve_user_room_success(input: {
  base: Record<string, unknown>
  channel: chat_channel
  selected_source: resolve_user_room_ok['selected_source']
  room: room_row
  participant_uuid: string
  is_new_room: boolean
  user_uuid: string | null
}): Promise<resolve_user_room_ok> {
  const {
    base,
    channel,
    selected_source,
    room,
    participant_uuid,
    is_new_room,
    user_uuid,
  } = input

  const bot_participant = await resolve_bot_participant(room.room_uuid)

  await emit_chat_room_resolve_event(
    'chat_room_participant_lookup_succeeded',
    {
      ...base,
      channel,
      selected_source,
      room_uuid: room.room_uuid,
      participant_uuid,
    },
  )

  if (is_new_room) {
    await emit_chat_room_resolve_event('chat_room_created', {
      ...base,
      channel,
      selected_source,
      room_uuid: room.room_uuid,
    })
    await emit_chat_room_resolve_event('chat_room_participant_created', {
      ...base,
      channel,
      selected_source,
      participant_uuid,
    })
  }

  if (user_uuid) {
    await emit_chat_room_resolve_event('chat_room_user_attached', {
      ...base,
      channel,
      selected_source,
      room_uuid: room.room_uuid,
      participant_uuid,
    })
  }

  await emit_chat_room_resolve_event('chat_room_resolve_succeeded', {
    ...base,
    channel,
    selected_source,
    room_uuid: room.room_uuid,
    participant_uuid,
  })

  return {
    ok: true,
    room_uuid: room.room_uuid,
    participant_uuid,
    bot_participant_uuid: bot_participant.participant_uuid,
    last_incoming_channel: normalize_chat_channel(room.last_incoming_channel),
    mode: parse_room_mode(room.mode),
    channel,
    is_new_room,
    selected_source,
  }
}

type finalize_lookup_participant_outcome =
  | { tag: 'ok'; value: resolve_user_room_ok }
  | { tag: 'retry'; reason: string }

async function finalize_resolve_user_room_for_lookup_participant(input: {
  base: Record<string, unknown>
  channel: chat_channel
  visitor_uuid: string
  user_uuid: string | null
  selected_source: 'user_participant' | 'visitor_participant'
  participant: participant_row
}): Promise<finalize_lookup_participant_outcome> {
  const {
    base,
    channel,
    visitor_uuid,
    user_uuid,
    selected_source,
    participant,
  } = input

  if (participant.room_uuid && participant.participant_uuid) {
    const fast_room = await load_room_row(participant.room_uuid)

    if (
      fast_room &&
      fast_room.room_type === 'direct' &&
      fast_room.status !== 'inactive'
    ) {
      return {
        tag: 'ok',
        value: await complete_resolve_user_room_success({
          base,
          channel,
          selected_source,
          room: fast_room,
          participant_uuid: participant.participant_uuid,
          is_new_room: false,
          user_uuid,
        }),
      }
    }
  }

  let selected_participant = participant
  let selected_room: room_row | null = null
  let is_new_room = false

  if (selected_participant.room_uuid) {
    selected_room = await load_room_row(selected_participant.room_uuid)

    if (
      !selected_room ||
      selected_room.room_type !== 'direct' ||
      selected_room.status === 'inactive'
    ) {
      const assigned = await assign_participant_to_direct_room(
        {
          visitor_uuid,
          user_uuid,
          channel,
        },
        selected_participant,
        debug_identity_payload({
          visitor_uuid,
          user_uuid,
          channel,
        }),
      )

      selected_participant = assigned.participant
      selected_room = assigned.room
      is_new_room = assigned.is_new_room
    }
  }

  if (!selected_room) {
    const assigned = await assign_participant_to_direct_room(
      {
        visitor_uuid,
        user_uuid,
        channel,
      },
      selected_participant,
      debug_identity_payload({
        visitor_uuid,
        user_uuid,
        channel,
      }),
    )

    selected_participant = assigned.participant
    selected_room = assigned.room
    is_new_room = assigned.is_new_room
  }

  if (!selected_room?.room_uuid || !selected_participant?.participant_uuid) {
    return {
      tag: 'retry',
      reason: 'selected_participant_missing_room_or_participant_uuid',
    }
  }

  let final_participant = selected_participant

  if (
    !final_participant.room_uuid ||
    final_participant.room_uuid !== selected_room.room_uuid
  ) {
    const reread = await supabase
      .from('participants')
      .select(PARTICIPANT_DB_SELECT)
      .eq('participant_uuid', final_participant.participant_uuid)
      .maybeSingle()

    if (!reread.error && reread.data) {
      final_participant = reread.data as participant_row
    }
  }

  if (
    !final_participant.room_uuid ||
    final_participant.room_uuid !== selected_room.room_uuid
  ) {
    return { tag: 'retry', reason: 'participant_room_mismatch' }
  }

  return {
    tag: 'ok',
    value: await complete_resolve_user_room_success({
      base,
      channel,
      selected_source,
      room: selected_room,
      participant_uuid: final_participant.participant_uuid,
      is_new_room,
      user_uuid,
    }),
  }
}

/**
 * Single core: direct user room + participant (visitor/user merge via existing
 * ensure_direct_room_for_visitor + resolve_chat_room). No polling; no UI.
 */
export async function resolve_user_room(input: {
  visitor_uuid: string | null
  user_uuid: string | null
  channel: chat_channel
  source_channel?: string | null
  role?: string | null
  tier?: string | null
}): Promise<resolve_user_room_outcome> {
  const visitor_uuid = clean_uuid(input.visitor_uuid)
  const user_uuid = clean_uuid(input.user_uuid)
  const source_channel = input.source_channel ?? input.channel

  const base = {
    visitor_uuid,
    user_uuid,
    source_channel,
    role: input.role ?? null,
    tier: input.tier ?? null,
    reason: 'resolve_user_room',
  }

  if (!visitor_uuid) {
    await emit_chat_room_resolve_event('chat_room_resolve_failed', {
      ...base,
      error_code: 'missing_visitor_uuid',
      error_message: 'missing_visitor_uuid',
      error_details: null,
      error_hint: null,
    })

    return {
      ok: false,
      reason: 'missing_visitor_uuid',
      room_uuid: null,
      participant_uuid: null,
      error_code: 'missing_visitor_uuid',
      error_message: 'missing_visitor_uuid',
      error_details: null,
      error_hint: null,
    }
  }

  await emit_chat_room_resolve_event('chat_room_resolve_started', base)
  await emit_chat_room_resolve_event(
    'chat_room_participant_lookup_started',
    base,
  )

  const channel_plan: chat_channel[] = [input.channel]

  if (input.channel === 'web') {
    channel_plan.push('pwa')
  } else if (input.channel === 'pwa') {
    channel_plan.push('web')
  }

  let last_reason = 'resolve_not_ok'

  for (const channel of channel_plan) {
    try {
      const user_participant = user_uuid
        ? await find_user_participant_by_user(user_uuid)
        : null

      if (user_participant) {
        const user_outcome =
          await finalize_resolve_user_room_for_lookup_participant({
            base,
            channel,
            visitor_uuid,
            user_uuid,
            selected_source: 'user_participant',
            participant: user_participant,
          })

        if (user_outcome.tag === 'ok') {
          return user_outcome.value
        }

        last_reason = user_outcome.reason
        continue
      }

      const visitor_participant = visitor_uuid
        ? await find_user_participant_by_visitor(visitor_uuid)
        : null

      if (visitor_participant) {
        const visitor_outcome =
          await finalize_resolve_user_room_for_lookup_participant({
            base,
            channel,
            visitor_uuid,
            user_uuid,
            selected_source: 'visitor_participant',
            participant: visitor_participant,
          })

        if (visitor_outcome.tag === 'ok') {
          return visitor_outcome.value
        }

        last_reason = visitor_outcome.reason
        continue
      }

      let selected_participant: participant_row
      let selected_room: room_row | null = null
      let is_new_room = false
      const selected_source: resolve_user_room_ok['selected_source'] =
        'created_participant'

      const created = await try_insert_participant_and_direct_room(
        {
          visitor_uuid,
          user_uuid,
          channel,
        },
        debug_identity_payload({
          visitor_uuid,
          user_uuid,
          channel,
        }),
      )

      if (created.tag === 'reuse') {
        selected_participant = created.participant
        selected_room = selected_participant.room_uuid
          ? await load_room_row(selected_participant.room_uuid)
          : null
        is_new_room = false
      } else {
        selected_participant = created.participant
        selected_room = created.room
        is_new_room = created.is_new_room
      }

      if (!selected_room) {
        const assigned = await assign_participant_to_direct_room(
          {
            visitor_uuid,
            user_uuid,
            channel,
          },
          selected_participant,
          debug_identity_payload({
            visitor_uuid,
            user_uuid,
            channel,
          }),
        )

        selected_participant = assigned.participant
        selected_room = assigned.room
        is_new_room = assigned.is_new_room
      }

      if (!selected_room?.room_uuid || !selected_participant.participant_uuid) {
        last_reason = 'selected_participant_missing_room_or_participant_uuid'
        continue
      }

      let final_participant = selected_participant

      if (
        !final_participant.room_uuid ||
        final_participant.room_uuid !== selected_room.room_uuid
      ) {
        const reread = await supabase
          .from('participants')
          .select(PARTICIPANT_DB_SELECT)
          .eq('participant_uuid', final_participant.participant_uuid)
          .maybeSingle()

        if (!reread.error && reread.data) {
          final_participant = reread.data as participant_row
        }
      }

      if (
        !final_participant.room_uuid ||
        final_participant.room_uuid !== selected_room.room_uuid
      ) {
        last_reason = 'participant_room_mismatch'
        continue
      }

      return await complete_resolve_user_room_success({
        base,
        channel,
        selected_source,
        room: selected_room,
        participant_uuid: final_participant.participant_uuid,
        is_new_room,
        user_uuid,
      })
    } catch (error) {
      if (is_unique_violation(error)) {
        const recovered_user =
          user_uuid ? await find_user_participant_by_user(user_uuid) : null
        const recovered_visitor = visitor_uuid
          ? await find_user_participant_by_visitor(visitor_uuid)
          : null

        if (recovered_user) {
          const recovered_user_outcome =
            await finalize_resolve_user_room_for_lookup_participant({
              base,
              channel,
              visitor_uuid,
              user_uuid,
              selected_source: 'user_participant',
              participant: recovered_user,
            })

          if (recovered_user_outcome.tag === 'ok') {
            return recovered_user_outcome.value
          }
        }

        if (recovered_visitor) {
          const recovered_visitor_outcome =
            await finalize_resolve_user_room_for_lookup_participant({
              base,
              channel,
              visitor_uuid,
              user_uuid,
              selected_source: 'visitor_participant',
              participant: recovered_visitor,
            })

          if (recovered_visitor_outcome.tag === 'ok') {
            return recovered_visitor_outcome.value
          }
        }
      }

      const fields = supabase_error_fields(error)

      await emit_chat_room_resolve_event('chat_room_resolve_failed', {
        ...base,
        channel,
        reason: 'resolve_user_room_exception',
        room_uuid: null,
        participant_uuid: null,
        ...fields,
      })

      return {
        ok: false,
        reason: 'resolve_user_room_exception',
        room_uuid: null,
        participant_uuid: null,
        error_code: fields.error_code,
        error_message: fields.error_message,
        error_details: fields.error_details,
        error_hint: fields.error_hint,
      }
    }
  }

  await emit_chat_room_resolve_event('chat_room_resolve_failed', {
    ...base,
    reason: last_reason,
    room_uuid: null,
    participant_uuid: null,
    error_code: 'room_or_participant_missing',
    error_message: last_reason,
    error_details: null,
    error_hint: null,
  })

  return {
    ok: false,
    reason: last_reason,
    room_uuid: null,
    participant_uuid: null,
    error_code: 'room_or_participant_missing',
    error_message: last_reason,
    error_details: null,
    error_hint: null,
  }
}
