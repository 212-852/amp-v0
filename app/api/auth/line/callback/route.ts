import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import { control } from '@/lib/config/control'
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

function get_app_url() {
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
  return NextResponse.redirect(`${get_app_url() ?? ''}/`)
}

async function debug_line_login_failed(
  reason: string,
  data?: Record<string, unknown>,
) {
  if (!control.debug.line_auth) {
    return
  }

  await debug({
    category: 'line',
    event: 'line_login_callback_failed',
    data: {
      reason,
      ...data,
    },
  })
}

async function get_line_access_token(code: string) {
  const app_url = get_app_url()
  const callback_url = process.env.LINE_LOGIN_CALLBACK_URL
  const channel_id = process.env.LINE_LOGIN_CHANNEL_ID
  const channel_secret = process.env.LINE_LOGIN_CHANNEL_SECRET

  if (!app_url || !callback_url || !channel_id || !channel_secret) {
    await debug_line_login_failed('missing_env', {
      has_callback_url: Boolean(callback_url),
      has_channel_id: Boolean(channel_id),
      has_channel_secret: Boolean(channel_secret),
    })

    return null
  }

  const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callback_url,
      client_id: channel_id,
      client_secret: channel_secret,
    }),
  })

  if (!response.ok) {
    await debug_line_login_failed('token_request_failed', {
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
    await debug_line_login_failed('profile_request_failed', {
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

  cookie_store.delete(line_login_state_cookie_name)

  if (error) {
    await debug_line_login_failed('line_error', {
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
    const access_token = await get_line_access_token(code)

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
      display_name: profile?.displayName ?? null,
      image_url: profile?.pictureUrl ?? null,
    })

    if (control.debug.line_auth) {
      await debug({
        category: 'line',
        event: 'line_login_callback_passed',
        data: {
          user_uuid: access.user_uuid,
          visitor_uuid: access.visitor_uuid,
          is_new_user: access.is_new_user,
          is_new_visitor: access.is_new_visitor,
          line_user_id,
        },
      })
    }
  } catch {
    await debug_line_login_failed('unexpected_error')

    return redirect_home()
  }

  return redirect_home()
}
