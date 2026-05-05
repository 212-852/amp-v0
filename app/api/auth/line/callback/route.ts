import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import {
  exchange_line_code_for_token,
  fetch_line_oauth_profile,
} from '@/lib/auth/line_oauth'
import {
  get_browser_session_cookie_options,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import { debug } from '@/lib/debug'
import { line_login_state_cookie_name } from '../route'

function get_app_origin_from_callback_env() {
  const callback_url = process.env.LINE_LOGIN_CALLBACK_URL

  if (!callback_url) {
    return null
  }

  try {
    return new URL(callback_url).origin
  } catch {
    return null
  }
}

function redirect_home() {
  const origin = get_app_origin_from_callback_env() ?? ''

  return NextResponse.redirect(`${origin}/`)
}

async function debug_line_login_failed(
  reason: string,
  data?: Record<string, unknown>,
) {
  await debug({
    category: 'auth',
    event: 'line_login_callback_failed',
    data: {
      reason,
      ...data,
    },
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const cookie_store = await cookies()
  const saved_state = cookie_store.get(line_login_state_cookie_name)?.value
  const browser_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null

  cookie_store.delete(line_login_state_cookie_name)

  if (error) {
    await debug_line_login_failed('line_oauth_error', {
      error,
    })

    return redirect_home()
  }

  if (!code || !state || !saved_state || state !== saved_state) {
    await debug_line_login_failed('invalid_state_or_code', {
      has_code: Boolean(code),
      has_state: Boolean(state),
      has_saved_state: Boolean(saved_state),
      state_matches: Boolean(state && saved_state && state === saved_state),
    })

    return redirect_home()
  }

  try {
    const access_token = await exchange_line_code_for_token(code)

    if (!access_token) {
      await debug_line_login_failed('line_token_exchange_failed')

      return redirect_home()
    }

    const profile = await fetch_line_oauth_profile(access_token)
    const line_user_id = profile?.userId

    if (!line_user_id) {
      await debug_line_login_failed('missing_line_user_id', {
        has_profile: Boolean(profile),
      })

      return redirect_home()
    }

    const access = await resolve_auth_access({
      provider: 'line',
      provider_id: line_user_id,
      visitor_uuid: browser_visitor_uuid,
      display_name: profile.displayName ?? null,
      image_url: profile.pictureUrl ?? null,
      locale: null,
    })

    await debug({
      category: 'auth',
      event: 'line_login_callback_passed',
      data: {
        user_uuid: access.user_uuid,
        visitor_uuid: access.visitor_uuid,
        is_new_user: access.is_new_user,
        is_new_visitor: access.is_new_visitor,
        line_user_id,
      },
    })

    const response = redirect_home()

    response.cookies.set(
      visitor_cookie_name,
      access.visitor_uuid,
      get_browser_session_cookie_options(visitor_cookie_max_age),
    )

    return response
  } catch {
    await debug_line_login_failed('unexpected_error')

    return redirect_home()
  }
}
