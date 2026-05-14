import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

export type handoff_thread_entry = {
  memo_uuid: string
  body: string
  saved_by_user_uuid: string | null
  saved_by_name: string | null
  saved_by_role: string | null
  source_channel: string | null
  created_at: string
}

export type room_concierge_json = {
  handoff_memo?: string | null
  handoff_threads?: handoff_thread_entry[]
  support_status?: string | null
  assigned_admin_user_uuid?: string | null
  assigned_admin_internal_name?: string | null
  support_started_at?: string | null
  last_handoff_saved_at?: string | null
  last_handoff_saved_by_user_uuid?: string | null
  last_handoff_saved_by_name?: string | null
}

function parse_concierge_json(raw: unknown): room_concierge_json {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  return raw as room_concierge_json
}

export async function load_room_concierge_json(
  room_uuid_raw: string,
): Promise<room_concierge_json> {
  const room_uuid = clean_uuid(room_uuid_raw)

  if (!room_uuid) {
    return {}
  }

  const result = await supabase
    .from('rooms')
    .select('concierge_json')
    .eq('room_uuid', room_uuid)
    .maybeSingle()

  if (result.error || !result.data) {
    return {}
  }

  return parse_concierge_json(
    (result.data as { concierge_json?: unknown }).concierge_json,
  )
}

export async function save_room_concierge_json(input: {
  room_uuid: string
  next: room_concierge_json
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const room_uuid = clean_uuid(input.room_uuid)

  if (!room_uuid) {
    return { ok: false, error: new Error('invalid_room_uuid') }
  }

  const updated = await supabase
    .from('rooms')
    .update({
      concierge_json: input.next,
      updated_at: new Date().toISOString(),
    })
    .eq('room_uuid', room_uuid)
    .select('room_uuid')
    .maybeSingle()

  if (updated.error) {
    return { ok: false, error: updated.error }
  }

  return { ok: true }
}

export function append_handoff_thread(input: {
  current: room_concierge_json
  entry: Omit<handoff_thread_entry, 'memo_uuid'> & { memo_uuid?: string }
}): room_concierge_json {
  const memo_uuid =
    input.entry.memo_uuid?.trim() ||
    `thread_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const next_entry: handoff_thread_entry = {
    memo_uuid,
    body: input.entry.body,
    saved_by_user_uuid: input.entry.saved_by_user_uuid,
    saved_by_name: input.entry.saved_by_name,
    saved_by_role: input.entry.saved_by_role,
    source_channel: input.entry.source_channel,
    created_at: input.entry.created_at,
  }
  const prev_threads = Array.isArray(input.current.handoff_threads)
    ? input.current.handoff_threads
    : []

  return {
    ...input.current,
    handoff_memo: input.entry.body,
    handoff_threads: [next_entry, ...prev_threads],
    last_handoff_saved_at: input.entry.created_at,
    last_handoff_saved_by_user_uuid: input.entry.saved_by_user_uuid,
    last_handoff_saved_by_name: input.entry.saved_by_name,
  }
}
