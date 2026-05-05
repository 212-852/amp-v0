import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { resolve_auth_access } from '@/lib/auth/access'
import { supabase } from '@/lib/db/supabase'
import {
  ensure_session,
  get_browser_session_cookie_options,
  promote_browser_visitor_to_user,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import { control } from '@/lib/config/control'
import { debug, debug_event } from '@/lib/debug'
import { resolve_dispatch_locale } from '@/lib/dispatch/context'
import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

type liff_auth_body = {
  line_user_id?: string
  display_name?: string | null
  image_url?: string | null
  picture_url?: string | null
  status_message?: string | null
  locale?: string | null
  visitor_uuid?: string | null
  source_channel?: string | null
}

function pick_identity_uuid(row: Record<string, unknown> | null): string | null {
  if (!row) {
    return null
  }

  if (typeof row.identity_uuid === 'string') {
    return row.identity_uuid
  }

  if (typeof row.id === 'string') {
    return row.id
  }

  return null
}

async function fetch_line_identity_uuid(input: {
  user_uuid: string
  line_user_id: string
}): Promise<string | null> {
  const result = await supabase
    .from('identities')
    .select('*')
    .eq('user_uuid', input.user_uuid)
    .eq('provider', 'line')
    .eq('provider_id', input.line_user_id)
    .maybeSingle()

  if (result.error || !result.data) {
    return null
  }

  return pick_identity_uuid(result.data as Record<string, unknown>)
}

function get_allowed_user_ids() {
  return (
    process.env.LINE_REPLY_ALLOWED_USER_IDS
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean) ?? []
  )
}

function is_allowed_line_user(line_user_id: string) {
  if (process.env.LINE_REPLY_TEST_MODE !== 'true') {
    return true
  }

  return get_allowed_user_ids().includes(line_user_id)
}

async function debug_liff_event(
  event: string,
  payload?: Record<string, unknown>,
) {
  if (!control.debug.liff_auth) {
    return
  }

  await debug_event({
    category: 'liff',
    event,
    payload: payload ?? {},
  })
}

async function debug_liff_failed(
  reason: string,
  data?: Record<string, unknown>,
) {
  if (!control.debug.liff_auth) {
    return
  }

  await debug({
    category: 'liff',
    event: 'liff_auth_failed',
    data: {
      reason,
      ...data,
    },
  })
}

function get_client_ip(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()

    if (first) {
      return first
    }
  }

  return headers.get('x-real-ip')
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

async function resolve_liff_session_visitor(input: {
  request: Request
  visitor_uuid: string | null
  locale: string | null
}) {
  const headers = input.request.headers
  const visitor = await ensure_session({
    visitor_uuid: input.visitor_uuid,
    caller: 'api_session',
    source_channel: 'liff',
    locale: input.locale,
    user_agent: headers.get('user-agent'),
    access_platform: get_access_platform(headers.get('user-agent')),
    ip: get_client_ip(headers),
  })

  return visitor.visitor_uuid
}

async function update_liff_visitor(input: {
  visitor_uuid: string
  user_uuid: string
}) {
  const updated_at = new Date().toISOString()
  const updated = await supabase
    .from('visitors')
    .update({
      user_uuid: input.user_uuid,
      access_channel: 'liff',
      last_seen_at: updated_at,
      updated_at,
    })
    .eq('visitor_uuid', input.visitor_uuid)
    .select('visitor_uuid, user_uuid')
    .maybeSingle()

  if (updated.error) {
    throw updated.error
  }

  if (!updated.data?.visitor_uuid) {
    throw new Error('LIFF visitor row was not ensured by session core')
  }
}

async function update_liff_user_profile(input: {
  user_uuid: string
  display_name?: string | null
  image_url?: string | null
}) {
  if (!input.display_name && !input.image_url) {
    return
  }

  const updated = await supabase
    .from('users')
    .update({
      display_name: input.display_name ?? null,
      image_url: input.image_url ?? null,
    })
    .eq('user_uuid', input.user_uuid)

  if (updated.error) {
    throw updated.error
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as liff_auth_body
  const line_user_id = body.line_user_id
  const cookie_store = await cookies()
  const cookie_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null
  const current_visitor_uuid =
    cookie_visitor_uuid ?? body.visitor_uuid ?? null

  if (!line_user_id) {
    await debug_liff_failed('missing_line_user_id')

    return NextResponse.json(
      { ok: false, error: 'Missing line_user_id' },
      { status: 400 },
    )
  }

  if (!is_allowed_line_user(line_user_id)) {
    await debug_liff_failed('test_mode_blocked', {
      line_user_id,
    })

    return NextResponse.json(
      { ok: false, error: 'LINE user is not allowed' },
      { status: 403 },
    )
  }

  try {
    await debug_liff_event('liff_auth_route_started', {
      visitor_uuid: current_visitor_uuid,
      line_user_id,
    })

    if (cookie_visitor_uuid) {
      await debug_liff_event('liff_cookie_visitor_found', {
        visitor_uuid: cookie_visitor_uuid,
        line_user_id,
      })
    }

    const initial_locale = await resolve_dispatch_locale({
      source_channel: 'liff',
      browser_selected_locale: body.locale ?? null,
      debug: false,
    })
    const resolved_session_visitor_uuid = await resolve_liff_session_visitor({
      request,
      visitor_uuid: current_visitor_uuid,
      locale: initial_locale.locale,
    })

    const access = await resolve_auth_access({
      provider: 'line',
      provider_id: line_user_id,
      visitor_uuid: resolved_session_visitor_uuid,
      display_name: body.display_name ?? null,
      image_url: body.picture_url ?? body.image_url ?? null,
      locale: initial_locale.locale,
    })

    if (access.is_new_user) {
      await debug_liff_event('line_identity_created', {
        line_user_id,
        user_uuid: access.user_uuid,
        visitor_uuid: resolved_session_visitor_uuid,
      })
    } else {
      await debug_liff_event('line_identity_found', {
        line_user_id,
        user_uuid: access.user_uuid,
        visitor_uuid: resolved_session_visitor_uuid,
      })
    }

    await update_liff_user_profile({
      user_uuid: access.user_uuid,
      display_name: body.display_name ?? null,
      image_url: body.picture_url ?? body.image_url ?? null,
    })
    const resolved_locale = await resolve_dispatch_locale({
      source_channel: 'liff',
      stored_user_locale: access.locale,
      browser_selected_locale: body.locale ?? null,
    })
    const promoted = await promote_browser_visitor_to_user({
      old_visitor_uuid: resolved_session_visitor_uuid,
      user_uuid: access.user_uuid,
    })
    const resolved_visitor_uuid =
      promoted.visitor_uuid || access.visitor_uuid

    await update_liff_visitor({
      visitor_uuid: resolved_visitor_uuid,
      user_uuid: access.user_uuid,
    })

    await debug_liff_event('visitor_promoted_to_user', {
      visitor_uuid: resolved_visitor_uuid,
      user_uuid: access.user_uuid,
      line_user_id,
      promoted: promoted.promoted,
    })

    const identity_uuid = await fetch_line_identity_uuid({
      user_uuid: access.user_uuid,
      line_user_id,
    })

    await debug_liff_event('liff_auth_completed', {
      user_uuid: access.user_uuid,
      visitor_uuid: resolved_visitor_uuid,
      line_user_id,
      identity_uuid,
      locale: resolved_locale.locale,
      locale_source: resolved_locale.source,
      is_new_user: access.is_new_user,
    })

    const session_payload = {
      visitor_uuid: resolved_visitor_uuid,
      user_uuid: access.user_uuid,
      locale: resolved_locale.locale,
      role: 'user',
      tier: 'member',
      display_name: body.display_name ?? null,
      image_url: body.picture_url ?? body.image_url ?? null,
      line_connected: true,
      connected_providers: ['line'],
    }

    const response = NextResponse.json({
      ok: true,
      user_uuid: access.user_uuid,
      visitor_uuid: resolved_visitor_uuid,
      identity_uuid,
      is_new_user: access.is_new_user,
      is_new_visitor: access.is_new_visitor,
      locale: resolved_locale.locale,
      provider: 'line',
      session: session_payload,
    })

    const cookie_opts = get_browser_session_cookie_options(visitor_cookie_max_age)

    response.cookies.set(visitor_cookie_name, resolved_visitor_uuid, cookie_opts)
    response.cookies.set(browser_channel_cookie_name, 'liff', cookie_opts)

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await debug_liff_failed('exception', {
      line_user_id,
      message,
    })

    return NextResponse.json(
      { ok: false, error: 'LIFF auth failed' },
      { status: 500 },
    )
  }
}
