import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  resolve_guest_access,
  resolve_session_access,
} from '@/lib/auth/access'
import { control } from '@/lib/config/control'
import { supabase } from '@/lib/db/supabase'
import { debug } from '@/lib/debug'
import { normalize_locale, type locale_key } from '@/lib/locale/action'
import { resolve_visitor_context } from '@/lib/visitor/context'

type normalized_role = 'user' | 'driver' | 'admin' | 'guest'
type normalized_tier = 'guest' | 'member' | 'vip'
type connected_provider = 'line' | 'google' | 'email'

function get_browser_locale(accept_language: string | null) {
  return normalize_locale(accept_language?.split(',')[0])
}

function normalize_role(role: string | null | undefined): normalized_role {
  if (role === 'user' || role === 'driver' || role === 'admin') {
    return role
  }

  return 'guest'
}

function normalize_tier(tier: string | null | undefined): normalized_tier {
  if (tier === 'member' || tier === 'vip') {
    return tier
  }

  return 'guest'
}

function normalize_connected_providers(
  providers: Array<{ provider: string | null }>,
) {
  const connected_providers: connected_provider[] = []

  providers.forEach((identity) => {
    const provider = identity.provider?.toLowerCase()

    if (
      provider === 'line' ||
      provider === 'google' ||
      provider === 'email'
    ) {
      connected_providers.push(provider)
    }
  })

  return Array.from(new Set(connected_providers))
}

function normalize_client_session_shape(
  state: {
    role: normalized_role
    tier: normalized_tier
    locale: locale_key | null
    display_name: string | null
    line_connected: boolean
    connected_providers: connected_provider[]
  },
) {
  const connected_providers = state.connected_providers
  const line_connected =
    state.line_connected || connected_providers.includes('line')
  const linked =
    connected_providers.length > 0 || line_connected

  let role = state.role
  let tier = state.tier

  if (linked) {
    if (role === 'guest') {
      role = 'user'
    }

    if (tier === 'guest') {
      tier = 'member'
    }
  }

  return {
    ...state,
    role,
    tier,
    line_connected,
    connected_providers,
  }
}

function get_access_platform(user_agent: string | null) {
  const normalized_user_agent = user_agent?.toLowerCase() ?? ''

  if (
    normalized_user_agent.includes('iphone') ||
    normalized_user_agent.includes('ipad') ||
    normalized_user_agent.includes('ipod')
  ) {
    return 'ios'
  }

  if (normalized_user_agent.includes('android')) {
    return 'android'
  }

  if (normalized_user_agent.includes('mac os')) {
    return 'mac'
  }

  if (normalized_user_agent.includes('windows')) {
    return 'windows'
  }

  return 'unknown'
}

async function resolve_session_state(visitor_uuid: string) {
  const visitor_result = await supabase
    .from('visitors')
    .select('user_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()

  if (visitor_result.error) {
    throw visitor_result.error
  }

  const user_uuid = visitor_result.data?.user_uuid

  if (!user_uuid) {
    return {
      role: 'guest' as normalized_role,
      tier: 'guest' as normalized_tier,
      locale: null as locale_key | null,
      display_name: null as string | null,
      line_connected: false,
      connected_providers: [] as connected_provider[],
    }
  }

  const user_result = await supabase
    .from('users')
    .select('role, tier, locale, display_name')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (user_result.error) {
    throw user_result.error
  }

  const identity_result = await supabase
    .from('identities')
    .select('provider')
    .eq('user_uuid', user_uuid)

  if (identity_result.error) {
    throw identity_result.error
  }

  const connected_providers = normalize_connected_providers(
    identity_result.data ?? [],
  )

  return {
    role: normalize_role(user_result.data?.role),
    tier: normalize_tier(user_result.data?.tier),
    locale: user_result.data?.locale ?? null,
    display_name: user_result.data?.display_name ?? null,
    line_connected: connected_providers.includes('line'),
    connected_providers,
  }
}

export async function GET() {
  const header_store = await headers()

  const user_agent = header_store.get('user-agent')
  const accept_language = header_store.get('accept-language')
  const locale = get_browser_locale(accept_language)
  const is_line_webview =
    user_agent?.toLowerCase().includes('line/') ?? false

  const visitor = await resolve_visitor_context()
  const guest_access = await resolve_guest_access({
    visitor_uuid: visitor.visitor_uuid,
    locale,
  })
  const session_access = await resolve_session_access({
    visitor_uuid: guest_access.visitor_uuid,
    session_uuid: visitor.session_uuid,
    access_channel: 'web',
    access_platform: get_access_platform(user_agent),
    locale,
    user_agent,
  })
  const session_state = await resolve_session_state(guest_access.visitor_uuid)
  const normalized_session =
    normalize_client_session_shape(session_state)
  const resolved_locale = normalize_locale(
    normalized_session.locale ?? locale,
  )
  const role = normalized_session.role
  const tier = normalized_session.tier
  const line_connected = normalized_session.line_connected
  const connected_providers = normalized_session.connected_providers
  const display_name = normalized_session.display_name
  const requires_line_auth = is_line_webview && !line_connected
  const line_auth_method = requires_line_auth ? 'line_login' : null

  if (control.debug.session_route) {
    await debug({
      category: 'visitor',
      event: guest_access.is_new_visitor
        ? 'visitor_created'
        : 'visitor_restored',
      data: {
        visitor_uuid: guest_access.visitor_uuid,
        session_uuid: session_access.session_uuid,
        is_new_visitor: guest_access.is_new_visitor,
        is_new_session: session_access.is_new_session,
        locale: resolved_locale,
        accept_language,
        user_agent,
        role,
        tier,
        display_name,
        line_connected,
        connected_providers,
        is_line_webview,
        requires_line_auth,
        line_auth_method,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    visitor_uuid: guest_access.visitor_uuid,
    session_uuid: session_access.session_uuid,
    is_new_visitor: guest_access.is_new_visitor,
    is_new_session: session_access.is_new_session,
    locale: resolved_locale,
    role,
    tier,
    display_name,
    line_connected,
    connected_providers,
    is_line_webview,
    requires_line_auth,
    line_auth_method,
  })
}
