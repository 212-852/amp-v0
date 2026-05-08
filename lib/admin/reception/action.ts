import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid_payload'

import { debug_admin_reception } from './debug'
import {
  default_reception_state,
  is_reception_state,
  parse_reception_request,
  resolve_next_reception_state,
  should_admin_receive_concierge_notify,
  type reception_record,
  type reception_request_input,
  type reception_state,
} from './rules'

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
    await debug_admin_reception({
      event: 'admin_reception_update_completed',
      payload: {
        admin_user_uuid: input.admin_user_uuid,
        state: current.state,
        no_change: true,
      },
    })

    return {
      ok: true,
      record: current,
    }
  }

  await debug_admin_reception({
    event: 'admin_reception_update_started',
    payload: {
      admin_user_uuid: input.admin_user_uuid,
      from_state: current.state,
      to_state: next_state,
    },
  })

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

  await debug_admin_reception({
    event: 'admin_reception_update_completed',
    payload: {
      admin_user_uuid: input.admin_user_uuid,
      state: updated.state,
    },
  })

  return {
    ok: true,
    record: updated,
  }
}

export type reception_summary = {
  open_admin_user_uuids: string[]
  offline_admin_user_uuids: string[]
  open_admin_count: number
  total_admin_count: number
  has_open_admin: boolean
}

/**
 * Aggregated view used by notify/ to decide concierge notification targeting.
 *
 * - `open_admin_user_uuids`: admins whose `receptions.state = 'open'`, OR who
 *   have no row yet (treated as default `open`).
 * - `offline_admin_user_uuids`: admins whose `receptions.state = 'offline'`.
 * - `has_open_admin === false` should trigger owner/core fallback.
 */
export async function summarize_reception(): Promise<reception_summary> {
  const admins_result = await supabase
    .from('users')
    .select('user_uuid')
    .eq('role', 'admin')

  if (admins_result.error) {
    throw admins_result.error
  }

  const admin_user_uuids = (admins_result.data ?? [])
    .map((row) => (row as { user_uuid: string | null }).user_uuid)
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.length > 0,
    )

  if (admin_user_uuids.length === 0) {
    return {
      open_admin_user_uuids: [],
      offline_admin_user_uuids: [],
      open_admin_count: 0,
      total_admin_count: 0,
      has_open_admin: false,
    }
  }

  const reception_result = await supabase
    .from('receptions')
    .select(reception_select)
    .in('user_uuid', admin_user_uuids)

  if (reception_result.error) {
    throw reception_result.error
  }

  const rows = (reception_result.data ?? []) as reception_row[]
  const by_uuid = new Map<string, reception_row>()

  for (const row of rows) {
    by_uuid.set(row.user_uuid, row)
  }

  const open_list: string[] = []
  const offline_list: string[] = []

  for (const admin_user_uuid of admin_user_uuids) {
    const row = by_uuid.get(admin_user_uuid) ?? null
    const record = row_to_record(row)
    const state: reception_state | null = record?.state ?? null

    if (should_admin_receive_concierge_notify(state)) {
      open_list.push(admin_user_uuid)
    } else {
      offline_list.push(admin_user_uuid)
    }
  }

  return {
    open_admin_user_uuids: open_list,
    offline_admin_user_uuids: offline_list,
    open_admin_count: open_list.length,
    total_admin_count: admin_user_uuids.length,
    has_open_admin: open_list.length > 0,
  }
}
