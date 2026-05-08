import 'server-only'

import { get_session_user } from '@/lib/auth/route'

export type admin_reception_context =
  | {
      ok: true
      admin_user_uuid: string
      user_uuid: string
      role: string | null
      tier: string | null
    }
  | {
      ok: false
      status: 401 | 403
      error: 'session_required' | 'admin_required'
    }

/**
 * Resolve the current admin user from the session.
 * Pure context layer: no DB writes, no business decisions.
 */
export async function resolve_admin_reception_context(): Promise<admin_reception_context> {
  const session = await get_session_user()

  if (!session.user_uuid) {
    return {
      ok: false,
      status: 401,
      error: 'session_required',
    }
  }

  if (session.role !== 'admin') {
    return {
      ok: false,
      status: 403,
      error: 'admin_required',
    }
  }

  return {
    ok: true,
    admin_user_uuid: session.user_uuid,
    user_uuid: session.user_uuid,
    role: session.role,
    tier: session.tier,
  }
}
