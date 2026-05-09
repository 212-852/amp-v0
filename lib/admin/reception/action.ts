import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

import { debug_admin_reception } from './debug'
import {
  default_reception_state,
  is_reception_state,
  match_card_keyword,
  parse_reception_request,
  RECEPTION_LIST_HARD_LIMIT,
  resolve_next_reception_state,
  type list_reception_rooms_input,
  type reception_card,
  type reception_record,
  type reception_request_input,
  type reception_state,
} from './rules'

// ============================================================================
// Admin reception STATE core
// ----------------------------------------------------------------------------
// Read / write a single boolean-equivalent flag per admin (`open` | `offline`)
// stored in `public.receptions`. Used by the header reception toggle and the
// notification target resolver.
//
// The room-list loader (`list_reception_rooms`) lives further down in this
// same file so the entire reception core (state + rooms) ships from a single
// module per the One Build / Single Core rule.
// ============================================================================

type reception_row = {
  user_uuid: string
  state: string | null
  created_at: string | null
  updated_at: string
}

const reception_select = 'user_uuid, state, created_at, updated_at'

function row_to_record(row: reception_row | null): reception_record | null {
  if (!row) {
    return null
  }

  if (!is_reception_state(row.state)) {
    return null
  }

  return {
    state: row.state,
    updated_at: row.updated_at,
  }
}

function ensure_admin_uuid(value: string, fn_name: string): string {
  const sanitized = clean_uuid(value)

  if (!sanitized) {
    throw new Error(`${fn_name}: invalid admin_user_uuid (${value})`)
  }

  return sanitized
}

function serialize_error(error: unknown) {
  return {
    error_message: error instanceof Error ? error.message : String(error),
    error_code:
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code ?? null
        : null,
  }
}

/**
 * Read the reception row for an admin. If no row exists, insert one with
 * the default `open` state, and return the resulting record.
 */
export async function read_admin_reception(
  admin_user_uuid: string,
): Promise<reception_record> {
  const sanitized = ensure_admin_uuid(admin_user_uuid, 'read_admin_reception')

  const result = await supabase
    .from('receptions')
    .select(reception_select)
    .eq('user_uuid', sanitized)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const existing = row_to_record(result.data as reception_row | null)

  if (existing) {
    return existing
  }

  const inserted = await supabase
    .from('receptions')
    .upsert(
      {
        user_uuid: sanitized,
        state: default_reception_state,
      },
      { onConflict: 'user_uuid' },
    )
    .select(reception_select)
    .single()

  if (inserted.error) {
    throw inserted.error
  }

  const initialized = row_to_record(inserted.data as reception_row)

  if (initialized) {
    return initialized
  }

  return {
    state: default_reception_state,
    updated_at: new Date().toISOString(),
  }
}

async function upsert_admin_reception(input: {
  admin_user_uuid: string
  state: reception_state
}): Promise<reception_record> {
  const sanitized = ensure_admin_uuid(
    input.admin_user_uuid,
    'upsert_admin_reception',
  )

  const result = await supabase
    .from('receptions')
    .upsert(
      {
        user_uuid: sanitized,
        state: input.state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_uuid' },
    )
    .select(reception_select)
    .single()

  if (result.error) {
    throw result.error
  }

  const record = row_to_record(result.data as reception_row)

  if (record) {
    return record
  }

  return {
    state: input.state,
    updated_at: new Date().toISOString(),
  }
}

export type apply_admin_reception_result =
  | { ok: true; record: reception_record }
  | { ok: false; status: 400; error: 'invalid_state' }

export async function apply_admin_reception_request(input: {
  admin_user_uuid: string
  body: reception_request_input | null | undefined
}): Promise<apply_admin_reception_result> {
  const parsed = parse_reception_request(input.body)

  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      error: parsed.error,
    }
  }

  let current: reception_record

  try {
    current = await read_admin_reception(input.admin_user_uuid)
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      payload: {
        step: 'read_current',
        admin_user_uuid: input.admin_user_uuid,
        ...serialize_error(error),
      },
    })

    throw error
  }

  const next_state = resolve_next_reception_state(current, parsed.request)

  if (next_state === current.state) {
    return {
      ok: true,
      record: current,
    }
  }

  let updated: reception_record

  try {
    updated = await upsert_admin_reception({
      admin_user_uuid: input.admin_user_uuid,
      state: next_state,
    })
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      payload: {
        step: 'update',
        admin_user_uuid: input.admin_user_uuid,
        state: next_state,
        ...serialize_error(error),
      },
    })

    throw error
  }

  return {
    ok: true,
    record: updated,
  }
}

// ============================================================================
// Reception room list (single core)
// ----------------------------------------------------------------------------
// Reads ONLY from `rooms` (mode='concierge', order updated_at desc, limit).
// Returns a normalized `reception_card[]` so the API/UI never touches raw DB
// shapes. Enrichment from participants/users/visitors/messages will be added
// step by step on top of this same path; UI does not change when that
// happens (the `reception_card` contract stays stable).
// ============================================================================

type room_row = {
  room_uuid: string
  room_type: string | null
  status: string | null
  mode: string | null
  action_id: string | null
  created_at: string | null
  updated_at: string | null
}

const ROOM_SELECT =
  'room_uuid, room_type, status, mode, action_id, created_at, updated_at'

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

function default_card(row: room_row): reception_card {
  return {
    room_uuid: row.room_uuid,
    title: 'Concierge room',
    preview: '対応が必要です',
    updated_at: row.updated_at,
    mode: row.mode,
    typing_label: null,
    active_label: null,
  }
}

export type list_reception_rooms_result =
  | { ok: true; cards: reception_card[] }
  | { ok: false }

/**
 * Single core for the admin reception room list (mini inbox + full page).
 *
 * Failure policy: never throws. On Postgres error, logs
 * `admin_reception_failed { step:'list_rooms', query:'rooms', ... }` and
 * returns `{ ok: false }` so the API can render its own static fallback.
 */
export async function list_reception_rooms(
  input: list_reception_rooms_input,
): Promise<list_reception_rooms_result> {
  const limit = Math.max(
    1,
    Math.min(input.limit, RECEPTION_LIST_HARD_LIMIT),
  )

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

  const rows = (result.data ?? []) as room_row[]
  const all_cards = rows.map(default_card)
  const cards = input.keyword
    ? all_cards.filter((card) => match_card_keyword(card, input.keyword))
    : all_cards

  await debug_admin_reception({
    event: 'reception_rooms_loaded',
    payload: {
      raw_count: rows.length,
      visible_count: cards.length,
      room_uuids: cards.map((card) => card.room_uuid),
      limit,
      keyword: input.keyword,
    },
  })

  return { ok: true, cards }
}
