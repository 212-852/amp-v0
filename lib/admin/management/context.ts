import 'server-only'

import { redirect } from 'next/navigation'

import { get_session_user } from '@/lib/auth/route'

export type admin_management_tier = 'owner' | 'core'

export type admin_management_context =
  | {
      ok: true
      admin_user_uuid: string
      role: string | null
      tier: admin_management_tier
      display_name: string | null
      image_url: string | null
    }
  | {
      ok: false
      status: 401 | 403
      error: 'session_required' | 'admin_required' | 'tier_required'
      redirect_to: string
    }

const allowed_tiers: ReadonlyArray<admin_management_tier> = ['owner', 'core']

function is_admin_management_tier(
  value: string | null,
): value is admin_management_tier {
  return value !== null && (allowed_tiers as ReadonlyArray<string>).includes(value)
}

/**
 * Resolve the current admin and confirm owner/core tier.
 * Pure context layer: no DB writes, no business decisions, no UI.
 */
export async function resolve_admin_management_context(): Promise<admin_management_context> {
  const session = await get_session_user()

  if (!session.user_uuid) {
    return {
      ok: false,
      status: 401,
      error: 'session_required',
      redirect_to: '/',
    }
  }

  if (session.role !== 'admin') {
    return {
      ok: false,
      status: 403,
      error: 'admin_required',
      redirect_to: '/',
    }
  }

  if (!is_admin_management_tier(session.tier)) {
    return {
      ok: false,
      status: 403,
      error: 'tier_required',
      redirect_to: '/admin',
    }
  }

  return {
    ok: true,
    admin_user_uuid: session.user_uuid,
    role: session.role,
    tier: session.tier,
    display_name: session.display_name,
    image_url: session.image_url,
  }
}

/**
 * Server-side guard for /admin/management routes. On failure it redirects;
 * on success it returns the verified owner/core context.
 */
export async function require_admin_management_access(): Promise<{
  admin_user_uuid: string
  role: string | null
  tier: admin_management_tier
  display_name: string | null
  image_url: string | null
}> {
  const result = await resolve_admin_management_context()

  if (!result.ok) {
    redirect(result.redirect_to)
  }

  return {
    admin_user_uuid: result.admin_user_uuid,
    role: result.role,
    tier: result.tier,
    display_name: result.display_name,
    image_url: result.image_url,
  }
}
