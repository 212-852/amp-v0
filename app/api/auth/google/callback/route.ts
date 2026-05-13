import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import {
  get_browser_session_cookie_options,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import { debug } from '@/lib/debug'
import { notify_new_user_created } from '@/lib/notify/user/created'
import { google_login_state_cookie_name } from '../route'

type google_token_response = {
  access_token?: string
}

type google_userinfo_response = {
  sub?: string
  email?: string
  name?: string
  picture?: string
}

function get_app_url() {
  const callback_url = process.env.GOOGLE_LOGIN_CALLBACK_URL

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

async function debug_google_login_failed(
  reason: string,
  data?: Record<string, unknown>,
) {
  await debug({
    category: 'auth',
    event: 'google_login_callback_failed',
    data: {
      reason,
      ...data,
    },
  })
}

async function get_google_access_token(code: string) {
  const client_id = process.env.GOOGLE_CLIENT_ID
  const client_secret = process.env.GOOGLE_CLIENT_SECRET
  const callback_url = process.env.GOOGLE_LOGIN_CALLBACK_URL

  if (!client_id || !client_secret || !callback_url) {
    await debug_google_login_failed('missing_env', {
      has_client_id: Boolean(client_id),
      has_client_secret: Boolean(client_secret),
      has_callback_url: Boolean(callback_url),
    })

    return null
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id,
      client_secret,
      redirect_uri: callback_url,
    }),
  })

  if (!response.ok) {
    await debug_google_login_failed('token_request_failed', {
      status: response.status,
    })

    return null
  }

  const token = (await response.json()) as google_token_response

  return token.access_token ?? null
}

async function get_google_userinfo(access_token: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      authorization: `Bearer ${access_token}`,
    },
  })

  if (!response.ok) {
    await debug_google_login_failed('userinfo_request_failed', {
      status: response.status,
    })

    return null
  }

  return (await response.json()) as google_userinfo_response
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const cookie_store = await cookies()
  const saved_state = cookie_store.get(google_login_state_cookie_name)?.value
  const browser_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null

  cookie_store.delete(google_login_state_cookie_name)

  if (error) {
    await debug_google_login_failed('google_error', {
      error,
    })

    return redirect_home()
  }

  if (!code || !state || !saved_state || state !== saved_state) {
    await debug_google_login_failed('invalid_state_or_code', {
      has_code: Boolean(code),
      has_state: Boolean(state),
      has_saved_state: Boolean(saved_state),
      state_matches: Boolean(state && saved_state && state === saved_state),
    })

    return redirect_home()
  }

  try {
    const access_token = await get_google_access_token(code)

    if (!access_token) {
      return redirect_home()
    }

    const userinfo = await get_google_userinfo(access_token)
    const sub = userinfo?.sub

    if (!sub) {
      await debug_google_login_failed('missing_google_user_id', {
        has_userinfo: Boolean(userinfo),
      })

      return redirect_home()
    }

    const access = await resolve_auth_access({
      provider: 'google',
      provider_id: sub,
      visitor_uuid: browser_visitor_uuid,
      display_name: userinfo?.name ?? null,
      image_url: userinfo?.picture ?? null,
      locale: null,
    })

    if (access.is_new_user) {
      await notify_new_user_created({
        provider: 'google',
        user_uuid: access.user_uuid,
        visitor_uuid: access.visitor_uuid,
        display_name: userinfo?.name ?? null,
        locale: access.locale,
        is_new_user: access.is_new_user,
        is_new_visitor: access.is_new_visitor,
      })
    }

    await debug({
      category: 'auth',
      event: 'google_login_callback_passed',
      data: {
        user_uuid: access.user_uuid,
        visitor_uuid: access.visitor_uuid,
        is_new_user: access.is_new_user,
        is_new_visitor: access.is_new_visitor,
        google_user_id: sub,
        email_exists: Boolean(userinfo?.email),
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
    await debug_google_login_failed('unexpected_error')

    return redirect_home()
  }
}
