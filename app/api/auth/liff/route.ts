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
  locale?: string | null
  visitor_uuid?: string | null
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

export async function POST(request: Request) {
  const body = (await request.json()) as liff_auth_body
  const line_user_id = body.line_user_id
  const cookie_store = await cookies()
  const cookie_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null
  const current_visitor_uuid =
    cookie_visitor_uuid ?? body.visitor_uuid ?? null

  if (current_visitor_uuid) {
    await debug_liff_event('liff_cookie_visitor_found', {
      visitor_uuid: current_visitor_uuid,
      from_cookie: Boolean(cookie_visitor_uuid),
      from_body: !cookie_visitor_uuid && Boolean(body.visitor_uuid),
    })
  }

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
    await debug_liff_event('liff_profile_resolved', {
      line_user_id,
      visitor_uuid: current_visitor_uuid,
      display_name: body.display_name ?? null,
      has_picture_url: Boolean(body.picture_url || body.image_url),
      locale: body.locale ?? null,
    })

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

    if (cookie_visitor_uuid) {
      await debug_liff_event('visitor_cookie_reused', {
        visitor_uuid: resolved_session_visitor_uuid,
        user_uuid: null,
        source_channel: 'liff',
      })
      await debug_liff_event('visitor_create_skipped_cookie_exists', {
        visitor_uuid: resolved_session_visitor_uuid,
        user_uuid: null,
        source_channel: 'liff',
      })
    }

    const access = await resolve_auth_access({
      provider: 'line',
      provider_id: line_user_id,
      visitor_uuid: resolved_session_visitor_uuid,
      display_name: body.display_name ?? null,
      image_url: body.picture_url ?? body.image_url ?? null,
      locale: initial_locale.locale,
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

    if (!access.is_new_user) {
      await debug_liff_event('liff_identity_reused', {
        line_user_id,
        user_uuid: access.user_uuid,
        visitor_uuid: resolved_visitor_uuid,
      })
    }

    await debug_liff_event('liff_visitor_promoted_to_user', {
      user_uuid: access.user_uuid,
      visitor_uuid: resolved_visitor_uuid,
      old_visitor_uuid: resolved_session_visitor_uuid,
      promoted: promoted.promoted,
      existing_room_uuid: promoted.existing_room_uuid,
      participant_uuid: promoted.participant_uuid,
    })
    await debug_liff_event('visitor_promoted_to_user', {
      visitor_uuid: resolved_visitor_uuid,
      user_uuid: access.user_uuid,
      source_channel: 'liff',
    })

    await debug_liff_event('liff_auth_completed', {
      user_uuid: access.user_uuid,
      visitor_uuid: resolved_visitor_uuid,
      auth_visitor_uuid: access.visitor_uuid,
      is_new_user: access.is_new_user,
      is_new_visitor: access.is_new_visitor,
      line_user_id,
      locale: resolved_locale.locale,
      locale_source: resolved_locale.source,
    })

    const session_payload = {
      visitor_uuid: resolved_visitor_uuid,
      user_uuid: access.user_uuid,
      locale: resolved_locale.locale,
      role: 'user',
      tier: 'member',
      line_connected: true,
      connected_providers: ['line'],
    }

    const response = NextResponse.json({
      ok: true,
      user_uuid: access.user_uuid,
      visitor_uuid: resolved_visitor_uuid,
      is_new_user: access.is_new_user,
      is_new_visitor: access.is_new_visitor,
      locale: resolved_locale.locale,
      session: session_payload,
    })

    const cookie_opts = get_browser_session_cookie_options(visitor_cookie_max_age)

    response.cookies.set(visitor_cookie_name, resolved_visitor_uuid, cookie_opts)
    response.cookies.set(browser_channel_cookie_name, 'liff', cookie_opts)

    return response
  } catch {
    await debug_liff_failed('resolve_auth_access_failed', {
      line_user_id,
    })

    return NextResponse.json(
      { ok: false, error: 'LIFF auth failed' },
      { status: 500 },
    )
  }
}
