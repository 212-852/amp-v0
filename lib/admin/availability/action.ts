import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid_payload'

import { debug_admin_availability } from './debug'
import {
  default_admin_chat_available,
  parse_admin_availability_request,
  resolve_next_admin_availability,
  should_admin_receive_concierge_notify,
  type admin_availability_request_input,
  type admin_availability_state,
} from './rules'

type admin_availability_row = {
  admin_uuid: string
  chat_available: boolean
  updated_at: string
}

const admin_availability_select = 'admin_uuid, chat_available, updated_at'

function serialize_error(error: unknown) {
  return {
    error_message: error instanceof Error ? error.message : String(error),
    error_code:
      error && typeof error === 'object' && 'code' in error
        ? error.code ?? null
        : null,
  }
}

function row_to_state(row: admin_availability_row | null): admin_availability_state {
  if (!row) {
    return {
      chat_available: default_admin_chat_available,
      updated_at: new Date().toISOString(),
    }
  }

  return {
    chat_available: row.chat_available,
    updated_at: row.updated_at,
  }
}

export async function read_admin_chat_availability(
  admin_user_uuid: string,
): Promise<admin_availability_state> {
  const sanitized_admin_uuid = clean_uuid(admin_user_uuid)

  if (!sanitized_admin_uuid) {
    throw new Error(
      `read_admin_chat_availability: invalid admin_user_uuid (${admin_user_uuid})`,
    )
  }

  const result = await supabase
    .from('admin_availability')
    .select(admin_availability_select)
    .eq('admin_uuid', sanitized_admin_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return row_to_state(result.data as admin_availability_row | null)
}

async function upsert_admin_chat_availability(input: {
  admin_user_uuid: string
  chat_available: boolean
}): Promise<admin_availability_state> {
  const sanitized_admin_uuid = clean_uuid(input.admin_user_uuid)

  if (!sanitized_admin_uuid) {
    throw new Error(
      `upsert_admin_chat_availability: invalid admin_user_uuid (${input.admin_user_uuid})`,
    )
  }

  const now = new Date().toISOString()

  const result = await supabase
    .from('admin_availability')
    .upsert(
      {
        admin_uuid: sanitized_admin_uuid,
        chat_available: input.chat_available,
        updated_at: now,
      },
      { onConflict: 'admin_uuid' },
    )
    .select(admin_availability_select)
    .single()

  if (result.error) {
    throw result.error
  }

  return row_to_state(result.data as admin_availability_row)
}

export type apply_admin_availability_result =
  | { ok: true; state: admin_availability_state }
  | { ok: false; status: 400; error: 'invalid_chat_available' }

export async function apply_admin_availability_request(input: {
  admin_user_uuid: string
  body: admin_availability_request_input | null | undefined
}): Promise<apply_admin_availability_result> {
  const parsed = parse_admin_availability_request(input.body)

  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      error: parsed.error,
    }
  }

  let current: admin_availability_state

  try {
    current = await read_admin_chat_availability(input.admin_user_uuid)
  } catch (error) {
    await debug_admin_availability({
      event: 'admin_availability_failed',
      payload: {
        step: 'read_current',
        ...serialize_error(error),
      },
    })

    throw error
  }
  const next_chat_available = resolve_next_admin_availability(
    current,
    parsed.request,
  )

  if (next_chat_available === current.chat_available) {
    await debug_admin_availability({
      event: 'admin_availability_update_completed',
      payload: {
        admin_uuid: input.admin_user_uuid,
        chat_available: current.chat_available,
        ok: true,
      },
    })

    return {
      ok: true,
      state: current,
    }
  }

  await debug_admin_availability({
    event: 'admin_availability_update_started',
    payload: {
      admin_uuid: input.admin_user_uuid,
      chat_available: next_chat_available,
    },
  })

  let updated: admin_availability_state

  try {
    updated = await upsert_admin_chat_availability({
      admin_user_uuid: input.admin_user_uuid,
      chat_available: next_chat_available,
    })
  } catch (error) {
    await debug_admin_availability({
      event: 'admin_availability_failed',
      payload: {
        step: 'update',
        admin_uuid: input.admin_user_uuid,
        chat_available: next_chat_available,
        ...serialize_error(error),
      },
    })

    throw error
  }

  await debug_admin_availability({
    event: 'admin_availability_update_completed',
    payload: {
      admin_uuid: input.admin_user_uuid,
      chat_available: updated.chat_available,
      ok: true,
    },
  })

  return {
    ok: true,
    state: updated,
  }
}

export type admin_availability_summary = {
  available_admin_user_uuids: string[]
  unavailable_admin_user_uuids: string[]
  available_admin_count: number
  total_admin_count: number
  has_available_admin: boolean
}

/**
 * Aggregated view used by notify/ to decide concierge notification targeting.
 *
 * - `available_admin_user_uuids`: admins where chat_available is true OR no row
 *   exists yet (default available).
 * - `unavailable_admin_user_uuids`: admins where chat_available is explicitly false.
 * - `has_available_admin === false` should trigger owner/core fallback.
 */
export async function summarize_admin_availability(): Promise<admin_availability_summary> {
  const admins_result = await supabase
    .from('users')
    .select('user_uuid')
    .eq('role', 'admin')

  if (admins_result.error) {
    throw admins_result.error
  }

  const admin_user_uuids = (admins_result.data ?? [])
    .map((row) => (row as { user_uuid: string | null }).user_uuid)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  if (admin_user_uuids.length === 0) {
    return {
      available_admin_user_uuids: [],
      unavailable_admin_user_uuids: [],
      available_admin_count: 0,
      total_admin_count: 0,
      has_available_admin: false,
    }
  }

  const availability_result = await supabase
    .from('admin_availability')
    .select(admin_availability_select)
    .in('admin_uuid', admin_user_uuids)

  if (availability_result.error) {
    throw availability_result.error
  }

  const availability_rows =
    (availability_result.data ?? []) as admin_availability_row[]
  const availability_by_uuid = new Map<string, admin_availability_row>()

  for (const row of availability_rows) {
    availability_by_uuid.set(row.admin_uuid, row)
  }

  const available: string[] = []
  const unavailable: string[] = []

  for (const admin_user_uuid of admin_user_uuids) {
    const row = availability_by_uuid.get(admin_user_uuid) ?? null
    const state = row
      ? { chat_available: row.chat_available, updated_at: row.updated_at }
      : null

    if (should_admin_receive_concierge_notify(state)) {
      available.push(admin_user_uuid)
    } else {
      unavailable.push(admin_user_uuid)
    }
  }

  return {
    available_admin_user_uuids: available,
    unavailable_admin_user_uuids: unavailable,
    available_admin_count: available.length,
    total_admin_count: admin_user_uuids.length,
    has_available_admin: available.length > 0,
  }
}
