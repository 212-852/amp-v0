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
import { debug_event } from '@/lib/debug'
import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

type liff_auth_body = {
  id_token?: string | null
  line_user_id?: string | null
  display_name?: string | null
  picture_url?: string | null
  image_url?: string | null
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

  await debug_event({
    category: 'liff',
    event: 'liff_auth_failed',
    payload: {
      reason,
      ...data,
    },
  })
}

function serialize_error(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    message: String(error),
  }
}

export async function POST(request: Request) {
  const cookie_store = await cookies()
  const cookie_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null

  let line_user_id = ''
  let profile_display_name: string | null = null
  let profile_image_url: string | null = null

  await debug_liff_event('liff_route_started', {
    visitor_uuid: cookie_visitor_uuid,
  })

  let body: liff_auth_body

  try {
    body = (await request.json()) as liff_auth_body
  } catch (error) {
    await debug_liff_failed('payload_parse_failed', {
      visitor_uuid: cookie_visitor_uuid,
      error: serialize_error(error),
    })

    return NextResponse.json(
      { ok: false, error: 'Invalid JSON payload' },
      { status: 400 },
    )
  }

  try {
    const raw_token = body.id_token
    const id_token =
      typeof raw_token === 'string'
        ? raw_token.trim()
        : raw_token
          ? String(raw_token).trim()
          : ''
    const profile_line_user_id =
      typeof body.line_user_id === 'string'
        ? body.line_user_id.trim()
        : ''

    await debug_liff_event('liff_payload_received', {
      visitor_uuid: cookie_visitor_uuid,
      line_user_id: profile_line_user_id || null,
      has_id_token: Boolean(id_token),
      has_line_user_id: Boolean(profile_line_user_id),
      has_display_name: Boolean(body.display_name),
      has_picture_url: Boolean(body.picture_url ?? body.image_url),
    })

    if (id_token) {
      await debug_liff_event('liff_token_verify_started', {
        visitor_uuid: cookie_visitor_uuid,
        line_user_id: profile_line_user_id || null,
      })

      let verified: Awaited<ReturnType<typeof verify_line_liff_id_token>>

      try {
        verified = await verify_line_liff_id_token(id_token)
      } catch (error) {
        await debug_liff_event('liff_token_verify_failed', {
          visitor_uuid: cookie_visitor_uuid,
          line_user_id: profile_line_user_id || null,
          reason: 'exception',
          error: serialize_error(error),
        })

        throw error
      }

      if (!verified) {
        await debug_liff_event('liff_token_verify_failed', {
          visitor_uuid: cookie_visitor_uuid,
          line_user_id: profile_line_user_id || null,
          reason: 'invalid_id_token',
        })
        await debug_liff_failed('id_token_verify_failed', {
          visitor_uuid: cookie_visitor_uuid,
          line_user_id: profile_line_user_id || null,
        })

        return NextResponse.json(
          { ok: false, error: 'Invalid id_token' },
          { status: 401 },
        )
      }

      line_user_id = verified.sub
      profile_display_name = body.display_name ?? null
      profile_image_url = body.picture_url ?? body.image_url ?? null

      await debug_liff_event('liff_token_verify_completed', {
        visitor_uuid: cookie_visitor_uuid,
        line_user_id,
      })
    } else if (profile_line_user_id) {
      await debug_liff_event('liff_token_verify_started', {
        visitor_uuid: cookie_visitor_uuid,
        line_user_id: profile_line_user_id,
        skipped: true,
        reason: 'profile_payload_used',
      })
      await debug_liff_event('liff_token_verify_completed', {
        visitor_uuid: cookie_visitor_uuid,
        line_user_id: profile_line_user_id,
        skipped: true,
        reason: 'profile_payload_used',
      })

      line_user_id = profile_line_user_id
      profile_display_name = body.display_name ?? null
      profile_image_url = body.picture_url ?? body.image_url ?? null
    } else {
      await debug_liff_failed('missing_auth_payload', {
        visitor_uuid: cookie_visitor_uuid,
      })

      return NextResponse.json(
        { ok: false, error: 'Missing id_token or line_user_id' },
        { status: 400 },
      )
    }

    if (!is_allowed_line_user(line_user_id)) {
      await debug_liff_failed('test_mode_blocked', {
        visitor_uuid: cookie_visitor_uuid,
        line_user_id,
      })

      return NextResponse.json(
        { ok: false, error: 'LINE user is not allowed' },
        { status: 403 },
      )
    }

    if (cookie_visitor_uuid) {
      await debug_liff_event('liff_cookie_visitor_found', {
        visitor_uuid: cookie_visitor_uuid,
        line_user_id,
      })
    }

    await debug_liff_event('liff_identity_lookup_started', {
      visitor_uuid: cookie_visitor_uuid,
      line_user_id,
    })

    await debug_liff_event('liff_visitor_promote_started', {
      visitor_uuid: cookie_visitor_uuid,
      line_user_id,
    })

    const result = await resolve_liff_login({
      request,
      line_user_id,
      display_name: profile_display_name,
      image_url: profile_image_url,
      browser_locale: null,
      visitor_uuid: cookie_visitor_uuid,
    })

    const { access, resolved_visitor_uuid, resolved_locale, identity_uuid } =
      result

    if (access.is_new_user) {
      await debug_liff_event('liff_user_created', {
        line_user_id,
        user_uuid: access.user_uuid,
        visitor_uuid: result.resolved_session_visitor_uuid,
      })
      await debug_liff_event('liff_identity_created', {
        line_user_id,
        user_uuid: access.user_uuid,
        visitor_uuid: result.resolved_session_visitor_uuid,
      })
    } else {
      await debug_liff_event('liff_identity_found', {
        line_user_id,
        user_uuid: access.user_uuid,
        visitor_uuid: result.resolved_session_visitor_uuid,
      })
    }

    await debug_liff_event('liff_visitor_promote_completed', {
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
      error: serialize_error(error),
    })

    return NextResponse.json(
      { ok: false, error: 'LIFF auth failed' },
      { status: 500 },
    )
  }
}
