import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { read_session } from './session'

export type admin_route_access =
  | {
      allowed: true
      user_uuid: string
      visitor_uuid: string
      display_name: string | null
    }
  | {
      allowed: false
      reason:
        | 'session_missing'
        | 'user_missing'
        | 'line_identity_missing'
        | 'admin_role_missing'
    }

type visitor_user_row = {
  user_uuid: string | null
}

type admin_user_row = {
  role: string | null
  display_name: string | null
}

export async function resolve_admin_route_access(): Promise<admin_route_access> {
  const session = await read_session()
  const visitor_uuid = session.visitor_uuid

  if (!visitor_uuid) {
    return {
      allowed: false,
      reason: 'session_missing',
    }
  }

  const visitor_result = await supabase
    .from('visitors')
    .select('user_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()

  if (visitor_result.error) {
    throw visitor_result.error
  }

  const visitor = visitor_result.data as visitor_user_row | null
  const user_uuid = visitor?.user_uuid ?? null

  if (!user_uuid) {
    return {
      allowed: false,
      reason: 'user_missing',
    }
  }

  const identity_result = await supabase
    .from('identities')
    .select('user_uuid')
    .eq('user_uuid', user_uuid)
    .eq('provider', 'line')
    .maybeSingle()

  if (identity_result.error) {
    throw identity_result.error
  }

  if (!identity_result.data?.user_uuid) {
    return {
      allowed: false,
      reason: 'line_identity_missing',
    }
  }

  const user_result = await supabase
    .from('users')
    .select('role, display_name')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (user_result.error) {
    throw user_result.error
  }

  const user = user_result.data as admin_user_row | null

  if (user?.role !== 'admin') {
    return {
      allowed: false,
      reason: 'admin_role_missing',
    }
  }

  return {
    allowed: true,
    user_uuid,
    visitor_uuid,
    display_name: user.display_name,
  }
}
