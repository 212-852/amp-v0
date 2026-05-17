import 'server-only'

import {
  apply_admin_availability_request,
  read_admin_availability,
  state_from_availability_record,
} from '@/lib/admin/action'

import type {
  reception_record,
  reception_request_input,
} from './rules'

export type apply_admin_reception_result =
  | { ok: true; record: reception_record }
  | { ok: false; status: 400; error: 'invalid_state' }

export async function read_admin_reception(
  admin_user_uuid: string,
): Promise<reception_record> {
  const record = await read_admin_availability(admin_user_uuid)

  return {
    state: state_from_availability_record(record),
    updated_at: record.updated_at,
  }
}

export async function apply_admin_reception_request(input: {
  admin_user_uuid: string
  body: reception_request_input | null | undefined
}): Promise<apply_admin_reception_result> {
  const result = await apply_admin_availability_request(input)

  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    record: {
      state: state_from_availability_record(result.record),
      updated_at: result.record.updated_at,
    },
  }
}
