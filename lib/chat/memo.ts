import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

import { can_create_handoff_memo } from './rules'
import type { handoff_memo } from './handoff'
import type { chat_channel } from './room'

export type create_handoff_memo_input = {
  room_uuid: string
  body: unknown
  saved_by_user_uuid?: string | null
  saved_by_name?: string | null
  saved_by_role?: string | null
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

function row_to_handoff_memo(row: handoff_memo_row): handoff_memo {
  return {
    memo_uuid: row.memo_uuid,
    room_uuid: row.room_uuid,
    body: row.body,
    saved_by_participant_uuid: row.saved_by_participant_uuid,
    saved_by_user_uuid: row.saved_by_user_uuid,
    saved_by_name: row.saved_by_name,
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
}): Promise<handoff_memo[]> {
  const room_uuid = clean_uuid(input.room_uuid)

  if (!room_uuid) {
    return []
  }

  const result = await supabase
    .from('chat_handoff_memos')
    .select(handoff_memo_select)
    .eq('room_uuid', room_uuid)
    .order('created_at', { ascending: true })

  if (result.error) {
    throw result.error
  }

  return ((result.data ?? []) as unknown as handoff_memo_row[]).map(
    row_to_handoff_memo,
  )
}

export async function create_handoff_memo(
  input: create_handoff_memo_input,
): Promise<
  | { ok: true; memo: handoff_memo }
  | { ok: false; error: 'invalid_room' | 'empty_body' | 'not_allowed' }
> {
  const room_uuid = clean_uuid(input.room_uuid)

  if (!room_uuid) {
    return { ok: false, error: 'invalid_room' }
  }

  if (!can_create_handoff_memo({ role: input.saved_by_role })) {
    return { ok: false, error: 'not_allowed' }
  }

  const body = normalize_handoff_memo_body(input.body)

  if (!body) {
    return { ok: false, error: 'empty_body' }
  }

  const saved_by_user_uuid = clean_uuid(input.saved_by_user_uuid)
  const saved_by_participant_uuid = await find_handoff_memo_participant({
    room_uuid,
    user_uuid: saved_by_user_uuid,
  })

  const result = await supabase
    .from('chat_handoff_memos')
    .insert({
      room_uuid,
      body,
      saved_by_participant_uuid,
      saved_by_user_uuid,
      saved_by_name: input.saved_by_name?.trim() || null,
      saved_by_role: input.saved_by_role?.trim() || null,
      source_channel: normalize_source_channel(input.source_channel),
    })
    .select(handoff_memo_select)
    .single()

  if (result.error) {
    throw result.error
  }

  return {
    ok: true,
    memo: row_to_handoff_memo(result.data as unknown as handoff_memo_row),
  }
}
