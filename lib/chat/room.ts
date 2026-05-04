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

function fallback_chat_room(input: resolve_room_input): chat_room {
  return {
    room_uuid: '',
    participant_uuid: '',
    bot_participant_uuid: '',
    user_uuid: input.user_uuid ?? null,
    visitor_uuid: input.visitor_uuid,
    channel: input.channel,
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

  await debug_event({
    category: 'chat_room',
    event,
    payload: {
      ...payload,
      error:
        payload.error !== undefined
          ? snapshot_error_for_log(payload.error)
          : undefined,
    },
  })
}

/** participants table: never include room_type in select/insert/update lists. */
const PARTICIPANT_DB_SELECT =
  'participant_uuid, room_uuid, user_uuid, visitor_uuid, role'

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
  }
}

async function find_canonical_user_participant(
  input: resolve_room_input,
): Promise<participant_row | null> {
  if (input.user_uuid) {
    const by_user = await supabase
      .from('participants')
      .select(PARTICIPANT_DB_SELECT)
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
    .select(PARTICIPANT_DB_SELECT)
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
  const now = new Date().toISOString()
  const room_result = await supabase
    .from('rooms')
    .insert({
      room_type: 'direct',
      status: 'active',
      updated_at: now,
    })
    .select('room_uuid, room_type, status, updated_at')
    .maybeSingle()

  if (room_result.error) {
    throw room_result.error
  }

  if (!room_result.data?.room_uuid) {
    throw new Error('insert_direct_room_row: no row returned')
  }

  return room_result.data as room_row
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

type create_attempt =
  | { tag: 'fresh'; room: room_row; participant: participant_row }
  | { tag: 'reuse'; participant: participant_row }

async function try_insert_participant_and_direct_room(
  input: resolve_room_input,
  identity: ReturnType<typeof debug_identity_payload>,
): Promise<create_attempt> {
  const room_row = await insert_direct_room_row()

  const now = new Date().toISOString()
  const participant_result = await supabase
    .from('participants')
    .insert(
      build_user_participant_insert_row(
        input,
        room_row.room_uuid,
        now,
      ),
    )
    .select(PARTICIPANT_DB_SELECT)
    .maybeSingle()

  if (!participant_result.error && participant_result.data) {
    await touch_room_row(room_row.room_uuid)

    return {
      tag: 'fresh',
      room: room_row,
      participant: participant_result.data as participant_row,
    }
  }

  if (!is_unique_violation(participant_result.error)) {
    await delete_orphan_direct_room(room_row.room_uuid)
    throw participant_result.error
  }

  await delete_orphan_direct_room(room_row.room_uuid)

  await debug_event({
    category: 'chat_room',
    event: 'participant_create_conflict',
    payload: {
      ...identity,
      room_uuid: room_row.room_uuid,
    },
  })

  const existing = await find_canonical_user_participant(input)

  if (!existing) {
    throw participant_result.error
  }

  await debug_event({
    category: 'chat_room',
    event: 'participant_reused_after_conflict',
    payload: {
      ...identity,
      participant_uuid: existing.participant_uuid,
      room_uuid: existing.room_uuid,
    },
  })

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

  const refreshed_room = await load_room(room.room_uuid)

  if (!refreshed_room) {
    throw new Error('touch_direct_participant: room missing after update')
  }

  return {
    participant: participant_result.data as participant_row,
    room: refreshed_room,
  }
}

async function move_participant_to_new_direct_room(
  input: resolve_room_input,
  participant: participant_row,
): Promise<{ room: room_row; participant: participant_row }> {
  const new_room = await insert_direct_room_row()
  const now = new Date().toISOString()

  const participant_result = await supabase
    .from('participants')
    .update(
      build_user_participant_move_update(
        input,
        new_room.room_uuid,
        now,
      ),
    )
    .eq('participant_uuid', participant.participant_uuid)
    .select(PARTICIPANT_DB_SELECT)
    .maybeSingle()

  if (participant_result.error) {
    await delete_orphan_direct_room(new_room.room_uuid)
    throw participant_result.error
  }

  if (!participant_result.data) {
    await delete_orphan_direct_room(new_room.room_uuid)
    throw new Error('move_participant: update returned no row')
  }

  await touch_room_row(new_room.room_uuid)

  const final_room = await load_room(new_room.room_uuid)

  if (!final_room) {
    throw new Error('move_participant: new room not found')
  }

  return {
    room: final_room,
    participant: participant_result.data as participant_row,
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
  const room = await load_room(participant.room_uuid)

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

    return finish_with_bot(
      input,
      identity,
      touched.room,
      touched.participant,
      false,
    )
  }

  const moved = await move_participant_to_new_direct_room(
    input,
    participant,
  )

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

  return finish_with_bot(
    input,
    identity,
    moved.room,
    moved.participant,
    true,
  )
}

export async function resolve_chat_room(
  input: resolve_room_input,
): Promise<resolve_chat_room_outcome> {
  const identity = debug_identity_payload(input)

  try {
    await debug_event({
      category: 'chat_room',
      event: 'participant_lookup_started',
      payload: identity,
    })

    let canonical = await find_canonical_user_participant(input)

    if (!canonical) {
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

      const linked_room = await load_room(created.room.room_uuid)

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
        true,
      )
    }

    return handle_existing_participant(input, identity, canonical)
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
