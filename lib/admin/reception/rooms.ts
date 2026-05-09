import 'server-only'

import { supabase } from '@/lib/db/supabase'

import { debug_admin_reception } from './debug'

/**
 * Single, intentionally minimal core for the admin reception list and the
 * mini inbox under the header.
 *
 * Why this module exists separately from `lib/admin/reception/action.ts`:
 *   The legacy room loader joined participants/users/visitors/messages and
 *   broke whenever any optional column was missing. To stop server errors
 *   completely we read ONLY from `rooms`, and the UI renders static
 *   placeholder text until we re-introduce enrichment step by step.
 *
 * Column policy:
 *   `rooms` is the only table we touch. Selected columns are exactly the
 *   ones the user has confirmed exist on the live DB.
 *
 * Failure policy:
 *   Never throws. On Postgres error we log via `debug_admin_reception`
 *   with full error fields and return `{ ok: false }` so the page can
 *   render its own static fallback.
 */

export type concierge_room = {
  room_uuid: string
  room_type: string | null
  status: string | null
  mode: string | null
  action_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type list_concierge_rooms_result =
  | { ok: true; rooms: concierge_room[] }
  | { ok: false }

const ROOM_SELECT =
  'room_uuid, room_type, status, mode, action_id, created_at, updated_at'

const HARD_LIMIT = 100

function pick_supabase_error(error: unknown) {
  const fields =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : {}

  return {
    error_code: fields.code ?? null,
    error_message:
      fields.message ?? (error instanceof Error ? error.message : null),
    error_details: fields.details ?? null,
    error_hint: fields.hint ?? null,
  }
}

export async function list_concierge_rooms(input: {
  limit: number
}): Promise<list_concierge_rooms_result> {
  const limit = Math.max(1, Math.min(input.limit, HARD_LIMIT))

  const result = await supabase
    .from('rooms')
    .select(ROOM_SELECT)
    .eq('mode', 'concierge')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (result.error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      payload: {
        step: 'list_rooms',
        query: 'rooms',
        ...pick_supabase_error(result.error),
      },
    })

    return { ok: false }
  }

  const rooms = (result.data ?? []) as concierge_room[]

  await debug_admin_reception({
    event: 'reception_rooms_loaded',
    payload: {
      raw_count: rooms.length,
      room_uuids: rooms.map((row) => row.room_uuid),
      limit,
    },
  })

  return { ok: true, rooms }
}
