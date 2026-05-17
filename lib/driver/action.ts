import 'server-only'

import { supabase } from '@/lib/db/supabase'

import type { driver_apply_input } from './rules'

export type driver_application_record = {
  application_uuid: string
  user_uuid: string
  status: string
  full_name: string | null
  phone: string | null
  residence_area: string | null
  experience_years: string | null
  availability: string | null
  message: string | null
  created_at: string
  updated_at: string
}

type driver_application_row = {
  application_uuid: string
  user_uuid: string
  status: string | null
  full_name: string | null
  phone: string | null
  residence_area: string | null
  experience_years: string | null
  availability: string | null
  message: string | null
  created_at: string
  updated_at: string
}

function row_to_record(row: driver_application_row): driver_application_record {
  return {
    application_uuid: row.application_uuid,
    user_uuid: row.user_uuid,
    status: row.status ?? 'pending',
    full_name: row.full_name,
    phone: row.phone,
    residence_area: row.residence_area,
    experience_years: row.experience_years,
    availability: row.availability,
    message: row.message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function read_driver_application_for_user(
  user_uuid: string,
): Promise<driver_application_record | null> {
  const result = await supabase
    .from('driver_applications')
    .select(
      'application_uuid, user_uuid, status, full_name, phone, residence_area, experience_years, availability, message, created_at, updated_at',
    )
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  if (!result.data) {
    return null
  }

  return row_to_record(result.data as driver_application_row)
}

export type submit_driver_application_result =
  | { ok: true; record: driver_application_record }
  | { ok: false; error: 'submit_failed' }

export async function submit_driver_application(input: {
  user_uuid: string
  value: driver_apply_input
}): Promise<submit_driver_application_result> {
  const updated_at = new Date().toISOString()
  const payload = {
    user_uuid: input.user_uuid,
    status: 'pending',
    full_name: input.value.full_name,
    phone: input.value.phone,
    residence_area: input.value.residence_area,
    experience_years: input.value.experience_years,
    availability: input.value.availability,
    message: input.value.message || null,
    updated_at,
  }

  const result = await supabase
    .from('driver_applications')
    .upsert(payload, { onConflict: 'user_uuid' })
    .select(
      'application_uuid, user_uuid, status, full_name, phone, residence_area, experience_years, availability, message, created_at, updated_at',
    )
    .single()

  if (result.error) {
    return { ok: false, error: 'submit_failed' }
  }

  return {
    ok: true,
    record: row_to_record(result.data as driver_application_row),
  }
}

export async function load_apply_page_output(user_uuid: string) {
  const existing = await read_driver_application_for_user(user_uuid)

  return {
    existing_application: existing,
  }
}
