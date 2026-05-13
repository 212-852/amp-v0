import 'server-only'

import { public_actions_table_name } from '@/lib/actions/table'
import { supabase } from '@/lib/db/supabase'

function read_action_row_id(row: Record<string, unknown>): string {
  for (const key of ['action_uuid', 'uuid', 'id', 'action_id']) {
    const value = row[key]

    if (value !== undefined && value !== null && String(value).length > 0) {
      return String(value)
    }
  }

  return ''
}

const support_started_dedupe_window_ms = 90_000

/**
 * Room must exist and be active; skip duplicate support_started in a short window.
 */
export async function evaluate_support_started_notify_gate(input: {
  room_uuid: string
  action_uuid: string
  created_at: string
}): Promise<
  | { allow: true; room_status: string | null }
  | {
      allow: false
      skip_reason: string
      room_status: string | null
    }
> {
  const room_result = await supabase
    .from('rooms')
    .select('room_uuid, status')
    .eq('room_uuid', input.room_uuid)
    .maybeSingle()

  if (room_result.error) {
    console.warn('[notify] support_started_gate_room_load_failed', {
      room_uuid: input.room_uuid,
      error: room_result.error,
    })

    return { allow: true, room_status: null }
  }

  if (!room_result.data) {
    return {
      allow: false,
      skip_reason: 'room_not_found',
      room_status: null,
    }
  }

  const room_status =
    typeof room_result.data.status === 'string'
      ? room_result.data.status
      : null

  if (room_status && room_status !== 'active') {
    return {
      allow: false,
      skip_reason: 'room_not_active',
      room_status,
    }
  }

  const table = public_actions_table_name()

  if (table !== 'chat_actions') {
    return { allow: true, room_status }
  }

  const window_start = new Date(
    new Date(input.created_at).getTime() - support_started_dedupe_window_ms,
  ).toISOString()

  const prior = await supabase
    .from(table)
    .select('*')
    .eq('room_uuid', input.room_uuid)
    .eq('action_type', 'support_started')
    .gte('created_at', window_start)
    .lte('created_at', input.created_at)
    .limit(40)

  if (prior.error) {
    console.warn('[notify] support_started_gate_prior_query_failed', {
      room_uuid: input.room_uuid,
      error: prior.error,
    })

    return { allow: true, room_status }
  }

  const rows = (prior.data ?? []) as Record<string, unknown>[]

  for (const row of rows) {
    const id = read_action_row_id(row)

    if (id === input.action_uuid) {
      continue
    }

    const ct = String(row.created_at ?? '')

    if (
      ct < input.created_at ||
      (ct === input.created_at && id < input.action_uuid)
    ) {
      return {
        allow: false,
        skip_reason: 'dedupe_recent_support_started',
        room_status,
      }
    }
  }

  return { allow: true, room_status }
}
