import 'server-only'

import { control } from '@/lib/config/control'
import { supabase } from '@/lib/db/supabase'
import { debug_event } from '@/lib/debug'

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
  visitor_uuid: string
  channel: chat_channel
  mode: room_mode
}

const ROOM_DB_SELECT =
  'room_uuid, room_type, status, updated_at, mode, discord_action_thread_id, discord_action_post_id, concierge_requested_at, concierge_accepted_at, bot_resumed_at'

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
  mode: string | null
  discord_action_thread_id: string | null
  discord_action_post_id: string | null
  concierge_requested_at: string | null
  concierge_accepted_at: string | null
  bot_resumed_at: string | null
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
    user_uuid: input.user_uuid ?? null,
    visitor_uuid: input.visitor_uuid,
    channel: input.channel,
    mode: 'bot',
  }
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
    user_uuid: input.user_uuid ?? participant.user_uuid ?? null,
    visitor_uuid: input.visitor_uuid,
    channel: input.channel,
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
  if (!error || typeof error !== 'object') {
    return {
      error,
      error_code: undefined as string | undefined,
      error_message: String(error),
      error_details: undefined as string | undefined,
      error_hint: undefined as string | undefined,
    }
  }

  const e = error as {
    code?: string
    message?: string
    details?: string
    hint?: string
  }

  return {
    error,
    error_code: e.code,
    error_message: e.message,
    error_details: e.details,
    error_hint: e.hint,
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
  const log_record = {
    ...payload,
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
  return {
    room_uuid,
    user_uuid: input.user_uuid ?? null,
    visitor_uuid: input.visitor_uuid,
    role: 'user' as const,
    status: 'active',
    last_channel: input.channel,
    updated_at: updated_at_iso,
  }
}

function build_user_participant_touch_update(
  input: resolve_room_input,
  updated_at_iso: string,
) {
  return {
    visitor_uuid: input.visitor_uuid,
    user_uuid: input.user_uuid ?? null,
    last_channel: input.channel,
    updated_at: updated_at_iso,
  }
}

function build_user_participant_move_update(
  input: resolve_room_input,
  new_room_uuid: string,
  updated_at_iso: string,
) {
  return {
    room_uuid: new_room_uuid,
    visitor_uuid: input.visitor_uuid,
    user_uuid: input.user_uuid ?? null,
    last_channel: input.channel,
    updated_at: updated_at_iso,
  }
}

function build_bot_participant_insert_row(room_uuid: string) {
  return {
    room_uuid: room_uuid ?? null,
    role: 'bot' as const,
    status: 'active',
  }
}

async function find_user_participant_by_user(user_uuid: string) {
  const result = await supabase
    .from('participants')
    .select(PARTICIPANT_DB_SELECT)
    .eq('role', 'user')
    .eq('user_uuid', user_uuid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data ? (result.data as participant_row) : null
}

async function find_user_participant_by_visitor(visitor_uuid: string) {
  const result = await supabase
    .from('participants')
    .select(PARTICIPANT_DB_SELECT)
    .eq('role', 'user')
    .eq('visitor_uuid', visitor_uuid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

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

  return find_user_participant_by_visitor(input.visitor_uuid)
}

export async function load_room_row(room_uuid: string) {
  const result = await supabase
    .from('rooms')
    .select(ROOM_DB_SELECT)
    .eq('room_uuid', room_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data as room_row | null
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
  void identity

  const now = new Date().toISOString()

  const room_result = await supabase
    .from('rooms')
    .insert({
      room_type: 'direct',
      status: 'active',
      updated_at: now,
      mode: 'bot',
    })
    .select(ROOM_DB_SELECT)
    .maybeSingle()

  if (room_result.error && !is_unique_violation(room_result.error)) {
    throw room_result.error
  }

  if (is_unique_violation(room_result.error)) {
    const existing_participant =
      await find_canonical_user_participant(input)

    if (!existing_participant?.room_uuid) {
      throw room_result.error
    }

    const existing_room = await load_room_row(existing_participant.room_uuid)

    if (!existing_room) {
      throw room_result.error
    }

    return {
      room: existing_room,
      created: false,
    }
  }

  if (!room_result.data?.room_uuid) {
    throw new Error('insert_direct_room_row: no row returned')
  }

  return {
    room: room_result.data as room_row,
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

  const participant_result = await supabase
    .from('participants')
    .insert(build_user_participant_insert_row(input, room.room_uuid, now))
    .select(PARTICIPANT_DB_SELECT)
    .maybeSingle()

  if (!participant_result.error && participant_result.data) {
    await touch_room_row(room.room_uuid)

    return {
      tag: 'fresh',
      room,
      participant: participant_result.data as participant_row,
      is_new_room: room_result.created,
    }
  }

  if (!is_unique_violation(participant_result.error)) {
    await delete_orphan_direct_room(room.room_uuid)
    throw participant_result.error
  }

  const existing = await find_canonical_user_participant(input)

  if (!existing) {
    throw participant_result.error
  }

  await delete_orphan_direct_room(room.room_uuid)

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
  input: resolve_room_input,
): Promise<resolve_chat_room_outcome> {
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

      const linked_room = await load_room_row(created.room.room_uuid)

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
