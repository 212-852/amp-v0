import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { is_line_in_app_browser } from '@/lib/auth/context'
import {
  ensure_session,
  get_visitor_cookie_options,
  infer_source_channel_from_ua,
  restore_visitor_user_link,
  visitor_cookie_max_age,
  visitor_cookie_name,
  type browser_session_result,
  type browser_session_source_channel,
} from '@/lib/auth/session'
import {
  browser_channel_cookie_name,
  client_display_mode_header_name,
  client_source_channel_header_name,
  client_visitor_header_name,
} from '@/lib/visitor/cookie'
import { get_request_visitor_uuid } from '@/lib/visitor/request'
import { control } from '@/lib/config/control'
import { resolve_initial_chat } from '@/lib/chat/action'
import { ensure_direct_room_for_visitor } from '@/lib/chat/room'
import type { chat_channel } from '@/lib/chat/room'
import { debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { load_user_pwa_installed } from '@/lib/push/action'
import { normalize_locale, type locale_key } from '@/lib/locale/action'

type normalized_role = 'user' | 'driver' | 'admin' | 'guest'
type normalized_tier = 'guest' | 'member' | 'vip'
type connected_provider = 'line' | 'google' | 'email'
type session_chat_state = {
  room_uuid: string
  mode: 'bot' | 'concierge'
  is_seeded: boolean
  message_count: number
  initial_carousel_card_count: number
} | null

function resolve_session_source_channel(
  browser_channel_cookie: string | null,
  client_source_channel: string | null,
  user_agent: string | null,
): browser_session_source_channel {
  const client_raw = client_source_channel?.trim().toLowerCase()

  if (client_raw === 'liff' || client_raw === 'pwa') {
    return client_raw
  }

  const raw = browser_channel_cookie?.trim().toLowerCase()

  if (raw === 'liff' || raw === 'pwa') {
    return raw
  }

  return infer_source_channel_from_ua(user_agent)
}

function session_source_to_chat_channel(
  src: browser_session_source_channel,
): chat_channel {
  if (src === 'web') {
    return 'web'
  }

  return src
}

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
    user_uuid: string | null
    locale: locale_key | null
    display_name: string | null
    image_url: string | null
    line_connected: boolean
    connected_providers: connected_provider[]
  },
) {
  const connected_providers = state.connected_providers
  const line_connected =
    state.line_connected || connected_providers.includes('line')
  const linked =
    connected_providers.length > 0 ||
    line_connected ||
    Boolean(state.user_uuid)

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

function get_client_ip(header_store: Headers) {
  const forwarded = header_store.get('x-forwarded-for')

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()

    if (first) {
      return first
    }
  }

  return header_store.get('x-real-ip')
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

function format_session_error(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  try {
    return JSON.parse(JSON.stringify(error))
  } catch {
    return String(error)
  }
}

function create_session_payload(input: {
  visitor_uuid: string | null
  user_uuid: string | null
  is_new_visitor: boolean
  is_new_session: boolean
  locale: locale_key
  role: normalized_role
  tier: normalized_tier
  display_name: string | null
  image_url: string | null
  line_connected: boolean
  connected_providers: connected_provider[]
  chat: session_chat_state
  is_line_webview: boolean
  requires_line_auth: boolean
  line_auth_method: string | null
  source_channel: browser_session_source_channel
  pwa_installed: boolean
}) {
  const session = input.visitor_uuid
    ? {
        visitor_uuid: input.visitor_uuid,
        user_uuid: input.user_uuid,
        locale: input.locale,
        role: input.role,
        tier: input.tier,
        display_name: input.display_name,
        image_url: input.image_url,
        line_connected: input.line_connected,
        connected_providers: input.connected_providers,
        chat: input.chat,
        source_channel: input.source_channel,
        pwa_installed: input.pwa_installed,
      }
    : null

  return {
    ok: true,
    session,
    visitor_uuid: input.visitor_uuid,
    user_uuid: input.user_uuid,
    is_new_visitor: input.is_new_visitor,
    is_new_session: input.is_new_session,
    locale: input.locale,
    role: input.role,
    tier: input.tier,
    display_name: input.display_name,
    image_url: input.image_url,
    line_connected: input.line_connected,
    connected_providers: input.connected_providers,
    chat: input.chat,
    is_line_webview: input.is_line_webview,
    requires_line_auth: input.requires_line_auth,
    line_auth_method: input.line_auth_method,
    source_channel: input.source_channel,
    pwa_installed: input.pwa_installed,
  }
}

async function resolve_session_chat(input: {
  visitor_uuid: string
  user_uuid: string | null
  channel: chat_channel
  locale: locale_key
  is_new_visitor: boolean
  session_restored: boolean
}): Promise<session_chat_state> {
  try {
    if (input.is_new_visitor) {
      await ensure_direct_room_for_visitor({
        visitor_uuid: input.visitor_uuid,
        user_uuid: input.user_uuid,
        channel: input.channel,
      })
    }

    const initial_chat = await resolve_initial_chat({
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
      channel: input.channel,
      locale: input.locale,
      session_restored: input.session_restored,
    })
    const initial_carousel_card_count = initial_chat.messages.reduce(
      (count, message) => {
        if (message.bundle.bundle_type !== 'initial_carousel') {
          return count
        }

        return count + message.bundle.cards.length
      },
      0,
    )

    return {
      room_uuid: initial_chat.room.room_uuid,
      mode: initial_chat.room.mode,
      is_seeded: initial_chat.is_seeded,
      message_count: initial_chat.messages.length,
      initial_carousel_card_count,
    }
  } catch (error) {
    console.error(
      '[session_api_chat_seed_error]',
      format_session_error(error),
    )

    return null
  }
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
      user_uuid: null,
      locale: null as locale_key | null,
      display_name: null as string | null,
      image_url: null as string | null,
      line_connected: false,
      connected_providers: [] as connected_provider[],
    }
  }

  const user_result = await supabase
    .from('users')
    .select('role, tier, locale, display_name, image_url')
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
    user_uuid,
    locale: user_result.data?.locale ?? null,
    display_name: user_result.data?.display_name ?? null,
    image_url: user_result.data?.image_url ?? null,
    line_connected: connected_providers.includes('line'),
    connected_providers,
  }
}

async function resolve_session_payload() {
  const header_store = await headers()
  const cookie_store = await cookies()

  const user_agent = header_store.get('user-agent')
  const accept_language = header_store.get('accept-language')
  const client_ip = get_client_ip(header_store)
  const locale = get_browser_locale(accept_language)
  const is_line_webview = is_line_in_app_browser(user_agent)
  const browser_channel_cookie =
    cookie_store.get(browser_channel_cookie_name)?.value ?? null
  const cookie_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null
  const client_visitor_uuid = clean_uuid(
    header_store.get(client_visitor_header_name),
  )
  const client_source_channel =
    header_store.get(client_source_channel_header_name)
  const display_mode = header_store.get(client_display_mode_header_name)
  const session_src = resolve_session_source_channel(
    browser_channel_cookie,
    client_source_channel,
    user_agent,
  )
  const request_visitor_uuid = await get_request_visitor_uuid()
  const restored_visitor_uuid = request_visitor_uuid ?? client_visitor_uuid
  const debug_base = {
    source_channel: session_src,
    host: header_store.get('host'),
    origin: header_store.get('origin'),
    pathname: '/api/session',
    is_standalone: display_mode === 'standalone',
    cookie_present: Boolean(cookie_visitor_uuid),
    local_storage_visitor_present: Boolean(client_visitor_uuid),
  }

  await debug_event({
    category: 'pwa',
    event: 'pwa_session_restore_started',
    payload: {
      ...debug_base,
      visitor_uuid: restored_visitor_uuid,
      user_uuid: null,
      role: null,
      tier: null,
      room_uuid: null,
      session_restored: false,
      reason:
        client_visitor_uuid && !cookie_visitor_uuid
          ? 'client_visitor_header_used'
          : 'cookie_or_request_header_used',
    },
  })

  const visitor = await ensure_session({
    visitor_uuid: restored_visitor_uuid,
    caller: 'api_session',
    source_channel: session_src,
    locale,
    user_agent,
    access_platform: get_access_platform(user_agent),
    ip: client_ip,
  })

  await restore_visitor_user_link(visitor.visitor_uuid)

  const session_state = await resolve_session_state(visitor.visitor_uuid)
  const normalized_session =
    normalize_client_session_shape(session_state)
  const resolved_locale = normalize_locale(
    normalized_session.locale ?? locale,
  )
  const chat_channel = session_source_to_chat_channel(session_src)
  const session_restored = Boolean(session_state.user_uuid)
  const chat = await resolve_session_chat({
    visitor_uuid: visitor.visitor_uuid,
    user_uuid: session_state.user_uuid,
    channel: chat_channel,
    locale: resolved_locale,
    is_new_visitor: visitor.is_new_visitor,
    session_restored,
  })
  const role = normalized_session.role
  const tier = normalized_session.tier
  const line_connected = normalized_session.line_connected
  const connected_providers = normalized_session.connected_providers
  const display_name = normalized_session.display_name
  const image_url = normalized_session.image_url
  const requires_line_auth = is_line_webview && !line_connected
  const line_auth_method = requires_line_auth ? 'line_login' : null

  let pwa_installed = false

  if (session_state.user_uuid) {
    pwa_installed = await load_user_pwa_installed(session_state.user_uuid)
  }

  await debug_event({
    category: 'pwa',
    event: session_restored
      ? 'pwa_session_restore_succeeded'
      : 'pwa_session_restore_failed',
    payload: {
      ...debug_base,
      visitor_uuid: visitor.visitor_uuid,
      user_uuid: session_state.user_uuid,
      role,
      tier,
      room_uuid: chat?.room_uuid ?? null,
      session_restored,
      reason: session_restored ? 'user_uuid_restored' : 'user_uuid_missing',
    },
  })

  await debug_event({
    category: 'pwa',
    event: visitor.is_new_visitor
      ? 'visitor_uuid_recreated'
      : 'visitor_uuid_reused',
    payload: {
      ...debug_base,
      visitor_uuid: visitor.visitor_uuid,
      user_uuid: session_state.user_uuid,
      role,
      tier,
      room_uuid: chat?.room_uuid ?? null,
      session_restored,
      reason: visitor.is_new_visitor
        ? 'new_visitor_row'
        : 'existing_visitor_row',
    },
  })

  if (session_state.user_uuid) {
    await debug_event({
      category: 'pwa',
      event: 'user_uuid_restored',
      payload: {
        ...debug_base,
        visitor_uuid: visitor.visitor_uuid,
        user_uuid: session_state.user_uuid,
        role,
        tier,
        room_uuid: chat?.room_uuid ?? null,
        session_restored: true,
        reason: 'visitor_linked_to_user',
      },
    })
  }

  if (control.debug.liff_auth && display_name) {
    await debug_event({
      category: 'liff',
      event: 'header_profile_loaded',
      payload: {
        display_name,
        has_image_url: Boolean(image_url),
        line_connected,
      },
    })
  }

  return {
    payload: create_session_payload({
      visitor_uuid: visitor.visitor_uuid,
      user_uuid: session_state.user_uuid,
      is_new_visitor: visitor.is_new_visitor,
      is_new_session: visitor.is_new_session,
      locale: resolved_locale,
      role,
      tier,
      display_name,
      image_url,
      line_connected,
      connected_providers,
      chat,
      is_line_webview,
      requires_line_auth,
      line_auth_method,
      source_channel: session_src,
      pwa_installed,
    }),
    visitor,
    session_source_channel: session_src,
  }
}

async function set_session_response_cookies(input: {
  response: NextResponse
  visitor: browser_session_result
  session_source_channel: ReturnType<typeof resolve_session_source_channel>
}) {
  input.response.cookies.set(
    visitor_cookie_name,
    input.visitor.visitor_uuid,
    get_visitor_cookie_options(visitor_cookie_max_age, {
      cross_site_friendly: input.session_source_channel === 'pwa',
    }),
  )
}

export async function GET() {
  try {
    const session = await resolve_session_payload()
    const response = NextResponse.json(session.payload)

    await set_session_response_cookies({
      response,
      visitor: session.visitor,
      session_source_channel: session.session_source_channel,
    })

    return response
  } catch (error) {
    const header_store = await headers()
    const cookie_store = await cookies()
    const fallback_source_channel = resolve_session_source_channel(
      cookie_store.get(browser_channel_cookie_name)?.value ?? null,
      header_store.get(client_source_channel_header_name),
      header_store.get('user-agent'),
    )
    const fallback_is_line_webview = is_line_in_app_browser(
      header_store.get('user-agent'),
    )

    console.error(
      '[session_api_error]',
      format_session_error(error),
    )

    return NextResponse.json(
      create_session_payload({
        visitor_uuid: null,
        user_uuid: null,
        is_new_visitor: false,
        is_new_session: false,
        locale: 'ja',
        role: 'guest',
        tier: 'guest',
        display_name: null,
        image_url: null,
        line_connected: false,
        connected_providers: [],
        chat: null,
        is_line_webview: fallback_is_line_webview,
        requires_line_auth: false,
        line_auth_method: null,
        source_channel: fallback_source_channel,
        pwa_installed: false,
      }),
    )
  }
}
