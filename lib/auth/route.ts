import 'server-only'

import { redirect } from 'next/navigation'

import type { normalized_role, normalized_tier } from '@/lib/auth/identity'
import {
  can_access_apply,
  can_access_driver_page,
} from '@/lib/driver/rules'
import { resolve_driver_route_subject } from '@/lib/driver/context'
import { supabase } from '@/lib/db/supabase'
import { debug_event } from '@/lib/debug'
import { run_browser_session_chat_room_resolve } from '@/lib/chat/browser_session_room'
import type { chat_channel } from '@/lib/chat/room'
import type { locale_key } from '@/lib/locale/action'
import { read_session } from './session'

export type admin_route_access =
  | {
      allowed: true
      user_uuid: string
      visitor_uuid: string
      display_name: string | null
      image_url: string | null
      role: 'admin'
      tier: string | null
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
  tier: string | null
  display_name: string | null
  image_url: string | null
}

export type session_user = {
  visitor_uuid: string | null
  user_uuid: string | null
  role: string | null
  tier: string | null
  display_name: string | null
  image_url: string | null
}

export type role_route_result = {
  redirect_to: string | null
}

type auth_route_debug_event =
  | 'AUTH_ROUTE admin_access_denied'
  | 'AUTH_ROUTE auth_route_failed'

async function emit_auth_route_debug(
  event: auth_route_debug_event,
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
      tier: null,
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
      tier: null,
      display_name: null,
      image_url: null,
    }
  }

  const user_result = await supabase
    .from('users')
    .select('role, tier, display_name, image_url')
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
    tier: user?.tier ?? null,
    display_name: user?.display_name ?? null,
    image_url: user?.image_url ?? null,
  }
}

export function can_access_admin(input: {
  role: string | null
}): input is { role: 'admin' } {
  return input.role === 'admin'
}

/**
 * Central role-based redirect rules (server). No UI logic.
 */
export async function resolve_role_route(input: {
  pathname: string
  user_uuid: string | null
  role: string | null
  tier: string | null
}): Promise<role_route_result> {
  const { pathname, user_uuid, role, tier } = input
  const base_payload = {
    pathname,
    user_uuid,
    role,
    tier,
  }

  if (pathname.startsWith('/admin')) {
    if (user_uuid && role === 'admin') {
      return { redirect_to: null }
    }

    await emit_auth_route_debug('AUTH_ROUTE admin_access_denied', {
      ...base_payload,
      redirect_to: '/',
    })

    return { redirect_to: '/' }
  }

  if (pathname === '/' || pathname === '/user') {
    if (user_uuid && role === 'admin') {
      return { redirect_to: '/admin' }
    }

    return { redirect_to: null }
  }

  return { redirect_to: null }
}

export async function resolve_admin_route_access(
  pathname = '/admin',
): Promise<admin_route_access> {
  const user = await get_session_user()
  const route = await resolve_role_route({
    pathname,
    user_uuid: user.user_uuid,
    role: user.role,
    tier: user.tier,
  })

  if (route.redirect_to) {
    if (!user.visitor_uuid) {
      return {
        allowed: false,
        reason: 'session_missing',
        pathname,
        user_uuid: null,
        role: null,
      }
    }

    if (!user.user_uuid) {
      return {
        allowed: false,
        reason: 'user_missing',
        pathname,
        user_uuid: null,
        role: null,
      }
    }

    return {
      allowed: false,
      reason: 'admin_role_missing',
      pathname,
      user_uuid: user.user_uuid,
      role: user.role,
    }
  }

  return {
    allowed: true,
    user_uuid: user.user_uuid!,
    visitor_uuid: user.visitor_uuid!,
    role: 'admin',
    tier: user.tier,
    display_name: user.display_name,
    image_url: user.image_url ?? null,
  }
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

  const session = await get_session_user()
  const route = await resolve_role_route({
    pathname,
    user_uuid: session.user_uuid,
    role: session.role,
    tier: session.tier,
  })

  if (route.redirect_to) {
    redirect(route.redirect_to)
  }

  return {
    user_uuid: session.user_uuid!,
    visitor_uuid: session.visitor_uuid!,
    display_name: session.display_name,
    image_url: session.image_url ?? null,
    role: 'admin' as const,
    tier: session.tier,
  }
}

export type driver_route_access =
  | {
      allowed: true
      user_uuid: string
      visitor_uuid: string
      display_name: string | null
      image_url: string | null
      role: 'driver'
      tier: string | null
    }
  | {
      allowed: false
      redirect_to: '/entry'
    }

export type apply_route_access =
  | {
      allowed: true
      user_uuid: string
      visitor_uuid: string
      display_name: string | null
      image_url: string | null
      role: string | null
      tier: string | null
    }
  | {
      allowed: false
      redirect_to: '/entry?reason=no_line'
    }

export async function resolve_driver_route_access(): Promise<driver_route_access> {
  const subject = await resolve_driver_route_subject()
  const session = await get_session_user()

  if (!can_access_driver_page(subject.user)) {
    return {
      allowed: false,
      redirect_to: '/entry',
    }
  }

  return {
    allowed: true,
    user_uuid: subject.user.user_uuid!,
    visitor_uuid: session.visitor_uuid!,
    display_name: session.display_name,
    image_url: session.image_url ?? null,
    role: 'driver',
    tier: session.tier,
  }
}

export async function require_driver_route_access() {
  const access = await resolve_driver_route_access()

  if (!access.allowed) {
    redirect(access.redirect_to)
  }

  return access
}

export async function resolve_apply_route_access(): Promise<apply_route_access> {
  const subject = await resolve_driver_route_subject()
  const session = await get_session_user()

  if (
    !can_access_apply({
      user: subject.user,
      identities: subject.identities,
    })
  ) {
    return {
      allowed: false,
      redirect_to: '/entry?reason=no_line',
    }
  }

  return {
    allowed: true,
    user_uuid: subject.user.user_uuid!,
    visitor_uuid: session.visitor_uuid!,
    display_name: session.display_name,
    image_url: session.image_url ?? null,
    role: session.role,
    tier: session.tier,
  }
}

export async function require_apply_route_access() {
  const access = await resolve_apply_route_access()

  if (!access.allowed) {
    redirect(access.redirect_to)
  }

  return access
}

export async function resolve_browser_session_chat_room(input: {
  visitor_uuid: string
  user_uuid: string | null
  channel: chat_channel
  locale: locale_key
  is_new_visitor: boolean
  session_restored: boolean
  role: normalized_role
  tier: normalized_tier
  source_channel: string
}) {
  return run_browser_session_chat_room_resolve(input)
}
