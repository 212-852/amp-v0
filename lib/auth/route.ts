import 'server-only'

import { redirect } from 'next/navigation'

import { supabase } from '@/lib/db/supabase'
import { debug_event } from '@/lib/debug'
import { read_session } from './session'

export type admin_route_access =
  | {
      allowed: true
      user_uuid: string
      visitor_uuid: string
      display_name: string | null
      image_url: string | null
      role: 'admin'
    }
  | {
      allowed: false
      reason:
        | 'session_missing'
        | 'user_missing'
        | 'admin_role_missing'
      pathname: string
      user_uuid: string | null
      role: string | null
    }

type visitor_user_row = {
  user_uuid: string | null
}

type admin_user_row = {
  role: string | null
  display_name: string | null
  image_url: string | null
}

type session_user = {
  visitor_uuid: string | null
  user_uuid: string | null
  role: string | null
  display_name: string | null
  image_url: string | null
}

async function emit_auth_route_debug(
  event: 'admin_access_allowed' | 'admin_access_denied',
  payload: Record<string, unknown>,
) {
  await debug_event({
    category: 'auth_route',
    event,
    payload,
  })
}

export async function get_session_user(): Promise<session_user> {
  const session = await read_session()
  const visitor_uuid = session.visitor_uuid

  if (!visitor_uuid) {
    return {
      visitor_uuid: null,
      user_uuid: null,
      role: null,
      display_name: null,
      image_url: null,
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
      visitor_uuid,
      user_uuid: null,
      role: null,
      display_name: null,
      image_url: null,
    }
  }

  const user_result = await supabase
    .from('users')
    .select('role, display_name, image_url')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (user_result.error) {
    throw user_result.error
  }

  const user = user_result.data as admin_user_row | null

  return {
    visitor_uuid,
    user_uuid,
    role: user?.role ?? null,
    display_name: user?.display_name ?? null,
    image_url: user?.image_url ?? null,
  }
}

export function can_access_admin(input: {
  role: string | null
}): input is { role: 'admin' } {
  return input.role === 'admin'
}

export async function resolve_admin_route_access(
  pathname = '/admin',
): Promise<admin_route_access> {
  const user = await get_session_user()

  if (!user.visitor_uuid) {
    const denied = {
      allowed: false as const,
      reason: 'session_missing' as const,
      pathname,
      user_uuid: null,
      role: null,
    }

    await emit_auth_route_debug('admin_access_denied', denied)

    return denied
  }

  if (!user.user_uuid) {
    const denied = {
      allowed: false as const,
      reason: 'user_missing' as const,
      pathname,
      user_uuid: null,
      role: null,
    }

    await emit_auth_route_debug('admin_access_denied', denied)

    return denied
  }

  if (!can_access_admin(user)) {
    const denied = {
      allowed: false as const,
      reason: 'admin_role_missing' as const,
      pathname,
      user_uuid: user.user_uuid,
      role: user.role,
    }

    await emit_auth_route_debug('admin_access_denied', denied)

    return denied
  }

  const allowed = {
    allowed: true as const,
    user_uuid: user.user_uuid,
    visitor_uuid: user.visitor_uuid,
    role: 'admin' as const,
    display_name: user.display_name,
    image_url: user.image_url ?? null,
  }

  await emit_auth_route_debug('admin_access_allowed', {
    pathname,
    user_uuid: allowed.user_uuid,
    role: allowed.role,
  })

  return allowed
}

export async function resolve_route_access(input: {
  pathname: string
}) {
  if (input.pathname.startsWith('/admin')) {
    return resolve_admin_route_access(input.pathname)
  }

  return {
    allowed: true as const,
    pathname: input.pathname,
  }
}

export async function require_admin_route_access(pathname = '/admin') {
  if (!pathname.startsWith('/admin')) {
    redirect('/')
  }

  const access = await resolve_admin_route_access(pathname)

  if (!access.allowed) {
    redirect('/')
  }

  return access
}
