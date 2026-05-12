import 'server-only'

import { batch_resolve_admin_operator_display } from '@/lib/admin/profile'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'

import { can_create_handoff_memo } from './rules'
import type { handoff_memo } from './handoff'
import type { chat_channel } from './room'

export type create_handoff_memo_input = {
  room_uuid: string
  body: unknown
  saved_by_user_uuid?: string | null
  saved_by_name?: string | null
  saved_by_role?: string | null
  saved_by_tier?: string | null
  source_channel?: chat_channel | null
}

export type handoff_memo_debug_context = {
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: chat_channel | null
}

type handoff_memo_row = {
  memo_uuid: string
  room_uuid: string
  body: string
  saved_by_participant_uuid: string | null
  saved_by_user_uuid: string | null
  saved_by_name: string | null
  saved_by_role: string | null
  source_channel: string | null
  created_at: string
}

const handoff_memo_select = [
  'memo_uuid',
  'room_uuid',
  'body',
  'saved_by_participant_uuid',
  'saved_by_user_uuid',
  'saved_by_name',
  'saved_by_role',
  'source_channel',
  'created_at',
].join(', ')

function normalize_handoff_memo_body(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, 2000)
}

function normalize_source_channel(value: chat_channel | null | undefined) {
  if (
    value === 'web' ||
    value === 'line' ||
    value === 'liff' ||
    value === 'pwa'
  ) {
    return value
  }

  return 'web'
}

function error_fields(error: unknown) {
  if (!error || typeof error !== 'object') {
    return {
      error_code: null,
      error_message: error ? String(error) : null,
      error_details: null,
      error_hint: null,
    }
  }

  const source = error as {
    code?: unknown
    message?: unknown
    details?: unknown
    hint?: unknown
  }

  return {
    error_code:
      typeof source.code === 'string' ? source.code : null,
    error_message:
      typeof source.message === 'string' ? source.message : String(error),
    error_details:
      typeof source.details === 'string' ? source.details : null,
    error_hint:
      typeof source.hint === 'string' ? source.hint : null,
  }
}

async function emit_handoff_memo_debug(input: {
  event:
    | 'handoff_memo_save_started'
    | 'handoff_memo_save_blocked'
    | 'handoff_memo_save_failed'
    | 'handoff_memo_save_succeeded'
    | 'handoff_memo_list_failed'
  room_uuid: string | null
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: chat_channel | null
  body_length?: number | null
  phase: string
  error?: unknown
  error_code?: string | null
  error_message?: string | null
  error_details?: string | null
  error_hint?: string | null
}) {
  const from_error = input.error ? error_fields(input.error) : null

  await debug_event({
    category: 'handoff_memo',
    event: input.event,
    payload: {
      room_uuid: input.room_uuid,
      participant_uuid: input.participant_uuid ?? null,
      user_uuid: input.user_uuid ?? null,
      role: input.role ?? null,
      tier: input.tier ?? null,
      source_channel: normalize_source_channel(input.source_channel),
      body_length: input.body_length ?? null,
      error_code: input.error_code ?? from_error?.error_code ?? null,
      error_message:
        input.error_message ?? from_error?.error_message ?? null,
      error_details:
        input.error_details ?? from_error?.error_details ?? null,
      error_hint: input.error_hint ?? from_error?.error_hint ?? null,
      phase: input.phase,
    },
  })
}

function row_to_handoff_memo(
  row: handoff_memo_row,
  saved_by_name_override?: string | null,
): handoff_memo {
  return {
    memo_uuid: row.memo_uuid,
    room_uuid: row.room_uuid,
    body: row.body,
    saved_by_participant_uuid: row.saved_by_participant_uuid,
    saved_by_user_uuid: row.saved_by_user_uuid,
    saved_by_name:
      saved_by_name_override !== undefined
        ? saved_by_name_override
        : row.saved_by_name,
    saved_by_role: row.saved_by_role,
    source_channel: normalize_source_channel(row.source_channel as chat_channel),
    created_at: row.created_at,
  }
}

async function find_handoff_memo_participant(input: {
  room_uuid: string
  user_uuid: string | null
}) {
  if (!input.user_uuid) {
    return null
  }

  const result = await supabase
    .from('participants')
    .select('participant_uuid')
    .eq('room_uuid', input.room_uuid)
    .eq('user_uuid', input.user_uuid)
    .in('role', ['admin', 'concierge'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return (result.data as { participant_uuid?: string } | null)
    ?.participant_uuid ?? null
}

export async function list_handoff_memos(input: {
  room_uuid: string
  debug?: handoff_memo_debug_context
}): Promise<handoff_memo[]> {
  const room_uuid = clean_uuid(input.room_uuid)

  if (!room_uuid) {
    return []
  }

  const phase = 'select_handoff_memos'

  try {
    const result = await supabase
      .from('chat_handoff_memos')
      .select(handoff_memo_select)
      .eq('room_uuid', room_uuid)
      .order('created_at', { ascending: true })

    if (result.error) {
      throw result.error
    }

    const rows = (result.data ?? []) as unknown as handoff_memo_row[]
    const label_map = await batch_resolve_admin_operator_display(
      rows.map((row) => row.saved_by_user_uuid),
      'memo_list',
    )

    return rows.map((row) => {
      const uuid = clean_uuid(row.saved_by_user_uuid)
      const resolved = uuid ? label_map.get(uuid) : undefined

      return row_to_handoff_memo(
        row,
        uuid ? (resolved ?? row.saved_by_name) : row.saved_by_name,
      )
    })
  } catch (error) {
    await emit_handoff_memo_debug({
      event: 'handoff_memo_list_failed',
      room_uuid,
      participant_uuid: input.debug?.participant_uuid,
      user_uuid: input.debug?.user_uuid,
      role: input.debug?.role,
      tier: input.debug?.tier,
      source_channel: input.debug?.source_channel,
      body_length: null,
      phase,
      error,
    })

    throw error
  }
}

export async function create_handoff_memo(
  input: create_handoff_memo_input,
): Promise<
  | { ok: true; memo: handoff_memo }
  | { ok: false; error: 'invalid_room' | 'empty_body' | 'not_allowed' }
> {
  const room_uuid = clean_uuid(input.room_uuid)
  const source_channel = normalize_source_channel(input.source_channel)
  const normalized_input_body = normalize_handoff_memo_body(input.body)
  const body_length = normalized_input_body.length

  await emit_handoff_memo_debug({
    event: 'handoff_memo_save_started',
    room_uuid,
    user_uuid: input.saved_by_user_uuid,
    role: input.saved_by_role,
    tier: input.saved_by_tier,
    source_channel,
    body_length,
    phase: 'create_handoff_memo_started',
  })

  if (!room_uuid) {
    await emit_handoff_memo_debug({
      event: 'handoff_memo_save_blocked',
      room_uuid,
      user_uuid: input.saved_by_user_uuid,
      role: input.saved_by_role,
      tier: input.saved_by_tier,
      source_channel,
      body_length,
      phase: 'validate_room',
      error_code: 'invalid_room',
      error_message: 'invalid_room',
    })

    return { ok: false, error: 'invalid_room' }
  }

  if (!can_create_handoff_memo({ role: input.saved_by_role })) {
    await emit_handoff_memo_debug({
      event: 'handoff_memo_save_blocked',
      room_uuid,
      user_uuid: input.saved_by_user_uuid,
      role: input.saved_by_role,
      tier: input.saved_by_tier,
      source_channel,
      body_length,
      phase: 'authorize_create_handoff_memo',
      error_code: 'not_allowed',
      error_message: 'not_allowed',
    })

    return { ok: false, error: 'not_allowed' }
  }

  const body = normalized_input_body

  if (!body) {
    await emit_handoff_memo_debug({
      event: 'handoff_memo_save_blocked',
      room_uuid,
      user_uuid: input.saved_by_user_uuid,
      role: input.saved_by_role,
      tier: input.saved_by_tier,
      source_channel,
      body_length,
      phase: 'validate_body',
      error_code: 'empty_body',
      error_message: 'empty_body',
    })

    return { ok: false, error: 'empty_body' }
  }

  const saved_by_user_uuid = clean_uuid(input.saved_by_user_uuid)

  let saved_by_participant_uuid: string | null = null
  let phase = 'find_saved_by_participant'

  try {
    saved_by_participant_uuid = await find_handoff_memo_participant({
      room_uuid,
      user_uuid: saved_by_user_uuid,
    })
  } catch (error) {
    await emit_handoff_memo_debug({
      event: 'handoff_memo_save_failed',
      room_uuid,
      user_uuid: saved_by_user_uuid,
      role: input.saved_by_role,
      tier: input.saved_by_tier,
      source_channel,
      body_length,
      phase: 'find_saved_by_participant',
      error,
    })

    throw error
  }

  phase = 'insert_handoff_memo'

  let saved_by_name_for_insert: string | null = input.saved_by_name?.trim() || null

  if (saved_by_user_uuid) {
    const label_map = await batch_resolve_admin_operator_display(
      [saved_by_user_uuid],
      'memo_snapshot',
    )

    saved_by_name_for_insert =
      label_map.get(saved_by_user_uuid) ?? saved_by_name_for_insert ?? 'Admin'
  }

  try {
    const result = await supabase
      .from('chat_handoff_memos')
      .insert({
        room_uuid,
        body,
        saved_by_participant_uuid,
        saved_by_user_uuid,
        saved_by_name: saved_by_name_for_insert,
        saved_by_role: input.saved_by_role?.trim() || null,
        source_channel,
      })
      .select(handoff_memo_select)
      .single()

    if (result.error) {
      throw result.error
    }

    const memo = row_to_handoff_memo(
      result.data as unknown as handoff_memo_row,
    )

    await emit_handoff_memo_debug({
      event: 'handoff_memo_save_succeeded',
      room_uuid,
      participant_uuid: saved_by_participant_uuid,
      user_uuid: saved_by_user_uuid,
      role: input.saved_by_role,
      tier: input.saved_by_tier,
      source_channel,
      body_length,
      phase: 'insert_handoff_memo',
    })

    return {
      ok: true,
      memo,
    }
  } catch (error) {
    await emit_handoff_memo_debug({
      event: 'handoff_memo_save_failed',
      room_uuid,
      participant_uuid: saved_by_participant_uuid,
      user_uuid: saved_by_user_uuid,
      role: input.saved_by_role,
      tier: input.saved_by_tier,
      source_channel,
      body_length,
      phase,
      error,
    })

    throw error
  }
}
