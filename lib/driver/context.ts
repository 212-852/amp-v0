import 'server-only'

import { get_session_user } from '@/lib/auth/route'
import { supabase } from '@/lib/db/supabase'

import {
  type driver_apply_input,
  type driver_identity_row,
  type driver_route_user,
  validate_driver_apply_input,
} from './rules'

export type driver_route_subject = {
  user: driver_route_user
  identities: driver_identity_row[]
}

export type driver_apply_request_body = Record<string, unknown> | null

export type normalized_driver_apply_request =
  | { ok: true; user_uuid: string; input: driver_apply_input }
  | { ok: false; error: 'invalid_apply_input' | 'session_missing' }

async function load_identities_for_user(
  user_uuid: string,
): Promise<driver_identity_row[]> {
  const result = await supabase
    .from('identities')
    .select('provider')
    .eq('user_uuid', user_uuid)

  if (result.error) {
    throw result.error
  }

  return (result.data ?? []) as driver_identity_row[]
}

/**
 * Session + identities for driver route decisions.
 */
export async function resolve_driver_route_subject(): Promise<driver_route_subject> {
  const session = await get_session_user()

  if (!session.user_uuid) {
    return {
      user: {
        user_uuid: null,
        role: session.role,
      },
      identities: [],
    }
  }

  const identities = await load_identities_for_user(session.user_uuid)

  return {
    user: {
      user_uuid: session.user_uuid,
      role: session.role,
    },
    identities,
  }
}

export function normalize_driver_apply_request(input: {
  body: driver_apply_request_body
  user_uuid: string | null
}): normalized_driver_apply_request {
  if (!input.user_uuid) {
    return { ok: false, error: 'session_missing' }
  }

  const parsed = validate_driver_apply_input(input.body)

  if (!parsed.ok) {
    return { ok: false, error: parsed.error }
  }

  return {
    ok: true,
    user_uuid: input.user_uuid,
    input: parsed.value,
  }
}
