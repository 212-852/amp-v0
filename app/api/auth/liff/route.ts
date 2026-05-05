import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { resolve_auth_access } from '@/lib/auth/access'
import { supabase } from '@/lib/db/supabase'
import {
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

export async function POST(request: Request) {
  const body = (await request.json()) as liff_auth_body
  const line_user_id = body.line_user_id
  const cookie_store = await cookies()
  const current_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? body.visitor_uuid ?? null

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
    const access = await resolve_auth_access({
      provider: 'line',
      provider_id: line_user_id,
      visitor_uuid: current_visitor_uuid,
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
      old_visitor_uuid: current_visitor_uuid,
      user_uuid: access.user_uuid,
    })
    const resolved_visitor_uuid =
      promoted.visitor_uuid || access.visitor_uuid

    await supabase
      .from('visitors')
      .update({
        access_channel: 'liff',
        updated_at: new Date().toISOString(),
      })
      .eq('visitor_uuid', resolved_visitor_uuid)

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

    const response = NextResponse.json({
      ok: true,
      user_uuid: access.user_uuid,
      visitor_uuid: resolved_visitor_uuid,
      is_new_user: access.is_new_user,
      is_new_visitor: access.is_new_visitor,
      locale: resolved_locale.locale,
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
