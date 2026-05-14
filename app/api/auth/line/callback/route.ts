import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import {
  complete_auth_link_session,
  fail_auth_link_session,
  find_pending_auth_link_session_by_state,
} from '@/lib/auth/link/action'
import {
  exchange_line_code_for_token,
  fetch_line_oauth_profile,
} from '@/lib/auth/line/oauth'
import {
  get_visitor_cookie_options,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import { debug, debug_event } from '@/lib/debug'
import { notify_new_user_created } from '@/lib/notify/user/created'
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

function redirect_return_path(return_path: string | null | undefined) {
  const origin = get_app_origin_from_callback_env() ?? ''

  return NextResponse.redirect(`${origin}${return_path ?? '/'}`)
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

  const link_session = state
    ? await find_pending_auth_link_session_by_state(state)
    : null

  if (link_session) {
    const { row, status } = link_session

    await debug_event({
      category: 'pwa',
      event: 'auth_link_callback_received',
      payload: {
        link_session_uuid: row.link_session_uuid,
        state_exists: true,
        visitor_uuid: row.visitor_uuid,
        user_uuid: row.user_uuid,
        completed_user_uuid: row.completed_user_uuid,
        source_channel: row.source_channel,
        provider: row.provider,
        status,
        return_path: row.return_path,
        phase: 'line_callback',
      },
    })

    if (status !== 'pending') {
      return redirect_return_path(row.return_path)
    }

    if (error) {
      await fail_auth_link_session({
        link_session_uuid: row.link_session_uuid,
        error_code: 'line_oauth_error',
        error_message: error,
      })

      return redirect_return_path(row.return_path)
    }

    if (!code || !state) {
      await fail_auth_link_session({
        link_session_uuid: row.link_session_uuid,
        error_code: 'invalid_state_or_code',
        error_message: 'missing code or state',
      })

      return redirect_return_path(row.return_path)
    }

    try {
      const access_token = await exchange_line_code_for_token(code)

      if (!access_token) {
        await fail_auth_link_session({
          link_session_uuid: row.link_session_uuid,
          error_code: 'line_token_exchange_failed',
        })

        return redirect_return_path(row.return_path)
      }

      const profile = await fetch_line_oauth_profile(access_token)
      const line_user_id = profile?.userId

      if (!line_user_id) {
        await fail_auth_link_session({
          link_session_uuid: row.link_session_uuid,
          error_code: 'missing_line_user_id',
        })

        return redirect_return_path(row.return_path)
      }

      const access = await resolve_auth_access({
        provider: 'line',
        provider_id: line_user_id,
        visitor_uuid: row.visitor_uuid,
        display_name: profile.displayName ?? null,
        image_url: profile.pictureUrl ?? null,
        locale: null,
      })

      if (access.is_new_user) {
        await notify_new_user_created({
          provider: 'line',
          user_uuid: access.user_uuid,
          visitor_uuid: access.visitor_uuid,
          display_name: profile.displayName ?? null,
          locale: access.locale,
          is_new_user: access.is_new_user,
          is_new_visitor: access.is_new_visitor,
        })
      }

      await complete_auth_link_session({
        link_session_uuid: row.link_session_uuid,
        completed_user_uuid: access.user_uuid,
      })

      const response = redirect_return_path(row.return_path)

      response.cookies.set(
        visitor_cookie_name,
        access.visitor_uuid,
        get_visitor_cookie_options(visitor_cookie_max_age, {
          cross_site_friendly: true,
        }),
      )

      return response
    } catch (link_error) {
      await fail_auth_link_session({
        link_session_uuid: row.link_session_uuid,
        error_code: 'unexpected_error',
        error_message:
          link_error instanceof Error
            ? link_error.message
            : String(link_error),
      })

      return redirect_return_path(row.return_path)
    }
  }

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

    if (access.is_new_user) {
      await notify_new_user_created({
        provider: 'line',
        user_uuid: access.user_uuid,
        visitor_uuid: access.visitor_uuid,
        display_name: profile.displayName ?? null,
        locale: access.locale,
        is_new_user: access.is_new_user,
        is_new_visitor: access.is_new_visitor,
      })
    }

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
      get_visitor_cookie_options(visitor_cookie_max_age, {
        cross_site_friendly: true,
      }),
    )

    return response
  } catch {
    await debug_line_login_failed('unexpected_error')

    return redirect_home()
  }
}
