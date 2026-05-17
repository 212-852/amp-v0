import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'

import {
  default_reception_state,
  is_reception_state,
  parse_reception_request,
  resolve_next_reception_state,
  type reception_record,
  type reception_request_input,
  type reception_state,
} from './rules'

type receptions_row = {
  user_uuid: string
  state: string
  updated_at: string
}

const reception_select = 'user_uuid, state, updated_at'

function ensure_admin_uuid(value: string, fn_name: string): string {
  const sanitized = clean_uuid(value)

  if (!sanitized) {
    throw new Error(`${fn_name}: invalid admin_user_uuid (${value})`)
  }

  return sanitized
}

function row_to_record(row: receptions_row | null): reception_record | null {
  if (!row || !is_reception_state(row.state)) {
    return null
  }

  return {
    state: row.state,
    updated_at: row.updated_at,
  }
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

async function debug_admin_reception_failed(input: {
  event: 'admin_reception_load_failed' | 'admin_reception_toggle_failed'
  step: string
  admin_user_uuid?: string | null
  error: unknown
}) {
  await debug_event({
    category: 'admin_management',
    event: input.event,
    payload: {
      step: input.step,
      admin_user_uuid: input.admin_user_uuid ?? null,
      ...serialize_error(input.error),
    },
  })
}

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

  const existing = row_to_record(result.data as receptions_row | null)

  if (existing) {
    return existing
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
  const updated_at = new Date().toISOString()

  const result = await supabase
    .from('receptions')
    .upsert(
      {
        user_uuid: sanitized,
        state: input.state,
        updated_at,
      },
      { onConflict: 'user_uuid' },
    )
    .select(reception_select)
    .single()

  if (result.error) {
    throw result.error
  }

  return (
    row_to_record(result.data as receptions_row | null) ?? {
      state: input.state,
      updated_at,
    }
  )
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
    await debug_admin_reception_failed({
      event: 'admin_reception_load_failed',
      step: 'read_current',
      admin_user_uuid: input.admin_user_uuid,
      error,
    })
    throw error
  }

  const next_state = resolve_next_reception_state(current, parsed.request)

  try {
    const updated = await upsert_admin_reception({
      admin_user_uuid: input.admin_user_uuid,
      state: next_state,
    })

    return {
      ok: true,
      record: updated,
    }
  } catch (error) {
    await debug_admin_reception_failed({
      event: 'admin_reception_toggle_failed',
      step: 'update',
      admin_user_uuid: input.admin_user_uuid,
      error,
    })
    throw error
  }
}

/**
 * Load reception rows for many admins. Missing rows are omitted (treat as closed).
 */
export async function load_receptions_by_user_uuid(
  user_uuids: string[],
): Promise<Map<string, reception_record>> {
  const map = new Map<string, reception_record>()

  if (user_uuids.length === 0) {
    return map
  }

  const result = await supabase
    .from('receptions')
    .select(reception_select)
    .in('user_uuid', user_uuids)

  if (result.error) {
    throw result.error
  }

  for (const raw of (result.data ?? []) as receptions_row[]) {
    const record = row_to_record(raw)

    if (!record) {
      continue
    }

    map.set(raw.user_uuid, record)
  }

  return map
}

/**
 * Open admin user UUIDs only (`state = 'open'`).
 */
export async function load_open_admin_user_uuids(
  user_uuids: string[],
): Promise<Set<string>> {
  const receptions = await load_receptions_by_user_uuid(user_uuids)
  const open = new Set<string>()

  for (const user_uuid of user_uuids) {
    const record = receptions.get(user_uuid)

    if (record?.state === 'open') {
      open.add(user_uuid)
    }
  }

  return open
}
