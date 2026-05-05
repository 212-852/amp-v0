import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import { parse_line_login_oauth_state } from '@/lib/auth/line/state'
import {
  promote_browser_visitor_to_user,
  visitor_cookie_name,
} from '@/lib/auth/session'
import { debug_event } from '@/lib/debug'
import { resolve_dispatch_locale } from '@/lib/dispatch/context'
import { line_login_state_cookie_name } from '../route'

type line_token_response = {
  access_token?: string
}

type line_profile_response = {
  userId?: string
  displayName?: string
  pictureUrl?: string
  language?: string
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
  await debug_event({
    category: 'line',
    event: 'line_login_callback_failed',
    payload: {
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
  const current_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null
  const parsed_oauth_state =
    saved_state && state && saved_state === state
      ? parse_line_login_oauth_state(saved_state)
      : null
  const merge_visitor_uuid =
    parsed_oauth_state?.browser_visitor_uuid ?? current_visitor_uuid ?? null

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
    await debug_event({
      category: 'line',
      event: 'line_login_started',
      payload: {
        merge_visitor_uuid,
      },
    })

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

    await debug_event({
      category: 'line',
      event: 'line_profile_fetched',
      payload: {
        line_user_id,
        display_name: profile?.displayName ?? null,
      },
    })

    const initial_locale = await resolve_dispatch_locale({
      source_channel: 'line',
      line_profile_locale: profile?.language ?? null,
    })
    const access = await resolve_auth_access({
      provider: 'line',
      provider_id: line_user_id,
      visitor_uuid: merge_visitor_uuid,
      display_name: profile?.displayName ?? null,
      image_url: profile?.pictureUrl ?? null,
      locale: initial_locale.locale,
    })
    const resolved_locale = await resolve_dispatch_locale({
      source_channel: 'line',
      stored_user_locale: access.locale,
      line_profile_locale: profile?.language ?? null,
    })
    const promoted = await promote_browser_visitor_to_user({
      old_visitor_uuid: merge_visitor_uuid,
      user_uuid: access.user_uuid,
    })
    const resolved_visitor_uuid =
      promoted.visitor_uuid || access.visitor_uuid

    await debug_event({
      category: 'line',
      event: 'line_login_completed',
      payload: {
        line_user_id,
        user_uuid: access.user_uuid,
        visitor_uuid: resolved_visitor_uuid,
        auth_visitor_uuid: access.visitor_uuid,
        merge_visitor_uuid,
        merge_visitor_from_oauth_state: Boolean(
          parsed_oauth_state?.browser_visitor_uuid,
        ),
        is_new_user: access.is_new_user,
        is_new_visitor: access.is_new_visitor,
        locale: resolved_locale.locale,
        locale_source: resolved_locale.source,
      },
    })
  } catch {
    await debug_line_login_failed('unexpected_error')

    return redirect_home()
  }

  return redirect_home()
}
