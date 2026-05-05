import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import {
  get_browser_session_cookie_options,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import {
  line_login_channel_id,
  line_login_channel_secret,
} from '@/lib/config/line_env'
import { debug } from '@/lib/debug'
import { line_login_state_cookie_name } from '../route'

type line_token_response = {
  access_token?: string
}

type line_profile_response = {
  userId?: string
  displayName?: string
  pictureUrl?: string
}

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

async function exchange_line_login_token(code: string) {
  const client_id = line_login_channel_id()
  const client_secret = line_login_channel_secret()
  const redirect_uri = process.env.LINE_LOGIN_CALLBACK_URL?.trim()

  if (!client_id || !client_secret || !redirect_uri) {
    await debug_line_login_failed('missing_line_login_env', {
      has_channel_id: Boolean(client_id),
      has_channel_secret: Boolean(client_secret),
      has_callback_url: Boolean(redirect_uri),
    })

    return null
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri,
    client_id,
    client_secret,
  })

  const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    await debug_line_login_failed('line_token_request_failed', {
      status: response.status,
    })

    return null
  }

  const token = (await response.json()) as line_token_response

  return token.access_token ?? null
}

async function get_line_profile(access_token: string) {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: {
      authorization: `Bearer ${access_token}`,
    },
  })

  if (!response.ok) {
    await debug_line_login_failed('line_profile_request_failed', {
      status: response.status,
    })

    return null
  }

  return (await response.json()) as line_profile_response
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
    const access_token = await exchange_line_login_token(code)

    if (!access_token) {
      return redirect_home()
    }

    const profile = await get_line_profile(access_token)
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
