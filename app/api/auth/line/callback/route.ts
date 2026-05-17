import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import {
  fail_pwa_line_pass,
  find_pending_pwa_line_pass_by_line_oauth_state,
  run_line_callback_for_pwa_one_time_pass,
} from '@/lib/auth/pwa/link/action'
import {
  exchange_line_code_for_token,
  fetch_line_oauth_profile,
} from '@/lib/auth/line/oauth'
import {
  get_visitor_cookie_options,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import {
  line_link_return_path_cookie_name,
  normalize_line_link_return_path,
} from '@/lib/auth/link/return_path'
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

function redirect_pwa_line_link_landing(
  request: Request,
  outcome: 'completed' | 'failed',
) {
  let origin = get_app_origin_from_callback_env()

  if (!origin) {
    try {
      origin = new URL(request.url).origin
    } catch {
      origin = ''
    }
  }

  return NextResponse.redirect(
    `${origin}/auth/pwa-line-callback?result=${outcome}`,
  )
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
  const line_link_return_path = normalize_line_link_return_path(
    cookie_store.get(line_link_return_path_cookie_name)?.value ?? null,
  )

  cookie_store.delete(line_login_state_cookie_name)

  const pass_lookup = state
    ? await find_pending_pwa_line_pass_by_line_oauth_state(state)
    : null

  if (pass_lookup) {
    const { row, status } = pass_lookup

    await debug_event({
      category: 'pwa',
      event: 'line_callback_pass_received',
      payload: {
        pass_uuid: row.pass_uuid,
        state_exists: true,
        visitor_uuid: row.visitor_uuid,
        completed_user_uuid: row.completed_user_uuid,
        status,
        phase: 'line_callback_one_time_pass',
      },
    })

    if (status !== 'open') {
      return redirect_pwa_line_link_landing(request, 'failed')
    }

    if (error) {
      await fail_pwa_line_pass({
        pass_uuid: row.pass_uuid,
        error_code: 'line_oauth_error',
        error_message: error,
      })

      return redirect_pwa_line_link_landing(request, 'failed')
    }

    if (!code || !state) {
      await fail_pwa_line_pass({
        pass_uuid: row.pass_uuid,
        error_code: 'invalid_state_or_code',
        error_message: 'missing code or state',
      })

      return redirect_pwa_line_link_landing(request, 'failed')
    }

    try {
      const access_token = await exchange_line_code_for_token(code)

      if (!access_token) {
        await fail_pwa_line_pass({
          pass_uuid: row.pass_uuid,
          error_code: 'line_token_exchange_failed',
        })

        return redirect_pwa_line_link_landing(request, 'failed')
      }

      const profile = await fetch_line_oauth_profile(access_token)
      const line_user_id = profile?.userId

      if (!line_user_id) {
        await fail_pwa_line_pass({
          pass_uuid: row.pass_uuid,
          error_code: 'missing_line_user_id',
        })

        return redirect_pwa_line_link_landing(request, 'failed')
      }

      const out = await run_line_callback_for_pwa_one_time_pass({
        code: state,
        line_user_id,
        display_name: profile.displayName ?? null,
        image_url: profile.pictureUrl ?? null,
      })

      if (out.is_new_user) {
        await notify_new_user_created({
          provider: 'line',
          user_uuid: out.user_uuid,
          visitor_uuid: out.visitor_uuid,
          display_name: out.display_name,
          locale: out.locale,
          is_new_user: out.is_new_user,
          is_new_visitor: out.is_new_visitor,
        })
      }

      const response = line_link_return_path
        ? redirect_return_path(line_link_return_path)
        : redirect_pwa_line_link_landing(request, 'completed')

      response.cookies.set(
        visitor_cookie_name,
        out.visitor_uuid,
        get_visitor_cookie_options(visitor_cookie_max_age, {
          cross_site_friendly: true,
        }),
      )
      response.cookies.delete(line_link_return_path_cookie_name)

      return response
    } catch (link_error) {
      await fail_pwa_line_pass({
        pass_uuid: row.pass_uuid,
        error_code: 'unexpected_error',
        error_message:
          link_error instanceof Error
            ? link_error.message
            : String(link_error),
      })

      return redirect_pwa_line_link_landing(request, 'failed')
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
