import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { verify_line_liff_id_token } from '@/lib/auth/line_liff_id_token'
import { resolve_liff_login } from '@/lib/auth/liff_login'
import {
  get_browser_session_cookie_options,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import { control } from '@/lib/config/control'
import { debug, debug_event } from '@/lib/debug'
import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

type liff_id_token_body = {
  id_token?: string | null
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
  const body = (await request.json()) as liff_id_token_body
  const raw_token = body.id_token
  const id_token =
    typeof raw_token === 'string'
      ? raw_token.trim()
      : raw_token
        ? String(raw_token).trim()
        : ''

  const cookie_store = await cookies()
  const cookie_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null

  if (!id_token) {
    await debug_liff_failed('missing_id_token')

    return NextResponse.json(
      { ok: false, error: 'Missing id_token' },
      { status: 400 },
    )
  }

  const verified = await verify_line_liff_id_token(id_token)

  if (!verified) {
    await debug_liff_failed('id_token_verify_failed')

    return NextResponse.json(
      { ok: false, error: 'Invalid id_token' },
      { status: 401 },
    )
  }

  const line_user_id = verified.sub

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
      visitor_uuid: cookie_visitor_uuid,
      line_user_id,
    })

    if (cookie_visitor_uuid) {
      await debug_liff_event('liff_cookie_visitor_found', {
        visitor_uuid: cookie_visitor_uuid,
        line_user_id,
      })
    }

    const result = await resolve_liff_login({
      request,
      line_user_id,
      display_name: null,
      image_url: null,
      browser_locale: null,
      visitor_uuid: cookie_visitor_uuid,
    })

    const { access, resolved_visitor_uuid, resolved_locale, identity_uuid } =
      result

    if (access.is_new_user) {
      await debug_liff_event('line_identity_created', {
        line_user_id,
        user_uuid: access.user_uuid,
        visitor_uuid: result.resolved_session_visitor_uuid,
      })
    } else {
      await debug_liff_event('line_identity_found', {
        line_user_id,
        user_uuid: access.user_uuid,
        visitor_uuid: result.resolved_session_visitor_uuid,
      })
    }

    await debug_liff_event('visitor_promoted_to_user', {
      visitor_uuid: resolved_visitor_uuid,
      user_uuid: access.user_uuid,
      line_user_id,
      promoted: result.promoted.promoted,
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

    const response = NextResponse.json({
      ok: true,
      user_uuid: access.user_uuid,
      visitor_uuid: resolved_visitor_uuid,
      identity_uuid,
      is_new_user: access.is_new_user,
      is_new_visitor: access.is_new_visitor,
      locale: resolved_locale.locale,
      provider: 'line',
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
