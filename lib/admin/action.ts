import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'

import {
  parse_admin_availability_request,
  resolve_next_admin_availability,
  state_from_admin_availability,
  type admin_availability_record,
  type admin_availability_request_input,
  type admin_availability_state,
} from './rules'

type admin_availability_row = {
  admin_user_uuid: string
  is_available: boolean
  updated_at: string
}

const availability_select =
  'admin_user_uuid, is_available, updated_at'

function ensure_admin_uuid(value: string, fn_name: string): string {
  const sanitized = clean_uuid(value)

  if (!sanitized) {
    throw new Error(`${fn_name}: invalid admin_user_uuid (${value})`)
  }

  return sanitized
}

function row_to_record(
  row: admin_availability_row | null,
): admin_availability_record | null {
  if (!row) {
    return null
  }

  return {
    is_available: row.is_available === true,
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

async function debug_admin_availability_failed(input: {
  step: string
  admin_user_uuid?: string | null
  error: unknown
}) {
  await debug_event({
    category: 'admin_management',
    event: 'admin_availability_toggle_failed',
    payload: {
      step: input.step,
      admin_user_uuid: input.admin_user_uuid ?? null,
      ...serialize_error(input.error),
    },
  })
}

export function state_from_availability_record(
  record: admin_availability_record,
): admin_availability_state {
  return state_from_admin_availability(record.is_available)
}

export async function read_admin_availability(
  admin_user_uuid: string,
): Promise<admin_availability_record> {
  const sanitized = ensure_admin_uuid(admin_user_uuid, 'read_admin_availability')

  const result = await supabase
    .from('admin_availability')
    .select(availability_select)
    .eq('admin_user_uuid', sanitized)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const existing = row_to_record(result.data as admin_availability_row | null)

  if (existing) {
    return existing
  }

  const inserted = await supabase
    .from('admin_availability')
    .upsert(
      {
        admin_user_uuid: sanitized,
        is_available: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'admin_user_uuid' },
    )
    .select(availability_select)
    .single()

  if (inserted.error) {
    throw inserted.error
  }

  const initialized = row_to_record(
    inserted.data as admin_availability_row | null,
  )

  if (initialized) {
    return initialized
  }

  return {
    is_available: false,
    updated_at: new Date().toISOString(),
  }
}

async function upsert_admin_availability(input: {
  admin_user_uuid: string
  is_available: boolean
}): Promise<admin_availability_record> {
  const sanitized = ensure_admin_uuid(
    input.admin_user_uuid,
    'upsert_admin_availability',
  )
  const updated_at = new Date().toISOString()

  const result = await supabase
    .from('admin_availability')
    .upsert(
      {
        admin_user_uuid: sanitized,
        is_available: input.is_available,
        updated_at,
      },
      { onConflict: 'admin_user_uuid' },
    )
    .select(availability_select)
    .single()

  if (result.error) {
    throw result.error
  }

  return (
    row_to_record(result.data as admin_availability_row | null) ?? {
      is_available: input.is_available,
      updated_at,
    }
  )
}

export type apply_admin_availability_result =
  | { ok: true; record: admin_availability_record }
  | { ok: false; status: 400; error: 'invalid_state' }

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

  let current: admin_availability_record

  try {
    current = await read_admin_availability(input.admin_user_uuid)
  } catch (error) {
    await debug_admin_availability_failed({
      step: 'read_current',
      admin_user_uuid: input.admin_user_uuid,
      error,
    })
    throw error
  }

  const next_is_available = resolve_next_admin_availability(
    current,
    parsed.request,
  )

  if (next_is_available === current.is_available) {
    return {
      ok: true,
      record: current,
    }
  }

  try {
    const updated = await upsert_admin_availability({
      admin_user_uuid: input.admin_user_uuid,
      is_available: next_is_available,
    })

    return {
      ok: true,
      record: updated,
    }
  } catch (error) {
    await debug_admin_availability_failed({
      step: 'update',
      admin_user_uuid: input.admin_user_uuid,
      error,
    })
    throw error
  }
}
