import 'server-only'

import { cookies } from 'next/headers'

import { verify_line_liff_id_token } from '@/lib/auth/liff/token'
import { resolve_liff_login } from '@/lib/auth/liff/login'
import {
  emit_liff_auth_failed,
  read_liff_env_snapshot,
  type liff_auth_failed_payload,
} from '@/lib/auth/liff/debug'
import { visitor_cookie_name } from '@/lib/auth/session'
import { debug_event } from '@/lib/debug'
import { control } from '@/lib/config/control'
import { notify_new_user_created } from '@/lib/notify/user/created'
import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

export type liff_line_auth_body = {
  id_token?: string | null
  line_user_id?: string | null
  display_name?: string | null
  picture_url?: string | null
  image_url?: string | null
  source_channel?: string | null
  return_path?: string | null
  current_url?: string | null
  pathname?: string | null
  search?: string | null
}

export type liff_line_auth_success = {
  ok: true
  user_uuid: string
  visitor_uuid: string
  identity_uuid: string | null
  is_new_user: boolean
  is_new_visitor: boolean
  locale: string | null
  provider: 'line'
  session_restored: true
}

export type liff_line_auth_failure = {
  ok: false
  error: string
  error_code: string
  http_status: number
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

function failure(input: {
  error: string
  error_code: string
  http_status: number
}): liff_line_auth_failure {
  return {
    ok: false,
    error: input.error,
    error_code: input.error_code,
    http_status: input.http_status,
  }
}

export async function run_liff_line_auth(input: {
  request: Request
  body: liff_line_auth_body
}): Promise<liff_line_auth_success | liff_line_auth_failure> {
  const cookie_store = await cookies()
  const cookie_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null

  const debug_base: liff_auth_failed_payload = {
    current_url: input.body.current_url ?? null,
    pathname: input.body.pathname ?? null,
    search: input.body.search ?? null,
    return_path:
      typeof input.body.return_path === 'string'
        ? input.body.return_path
        : null,
    liff_id_exists: Boolean(process.env.NEXT_PUBLIC_LIFF_ID?.trim()),
    ...read_liff_env_snapshot(),
  }

  await debug_liff_event('liff_route_started', {
    visitor_uuid: cookie_visitor_uuid,
    ...debug_base,
  })

  const raw_token = input.body.id_token
  const id_token =
    typeof raw_token === 'string'
      ? raw_token.trim()
      : raw_token
        ? String(raw_token).trim()
        : ''
  const profile_line_user_id =
    typeof input.body.line_user_id === 'string'
      ? input.body.line_user_id.trim()
      : ''

  let line_user_id = ''
  let profile_display_name = input.body.display_name ?? null
  let profile_image_url = input.body.picture_url ?? input.body.image_url ?? null

  try {
    if (id_token) {
      await debug_liff_event('liff_token_verify_started', {
        visitor_uuid: cookie_visitor_uuid,
        line_user_id: profile_line_user_id || null,
      })

      const verified = await verify_line_liff_id_token(id_token)

      if (verified) {
        line_user_id = verified.sub
        await debug_liff_event('liff_token_verify_completed', {
          visitor_uuid: cookie_visitor_uuid,
          line_user_id,
        })
      } else if (profile_line_user_id) {
        await debug_liff_event('liff_token_verify_failed', {
          visitor_uuid: cookie_visitor_uuid,
          line_user_id: profile_line_user_id,
          reason: 'invalid_id_token_fallback_profile',
        })
        line_user_id = profile_line_user_id
      } else {
        await emit_liff_auth_failed({
          ...debug_base,
          line_user_id_exists: false,
          error_code: 'invalid_id_token',
          error_message: 'Invalid id_token',
          reason: 'id_token_verify_failed',
        })

        return failure({
          error: 'Invalid id_token',
          error_code: 'invalid_id_token',
          http_status: 401,
        })
      }
    } else if (profile_line_user_id) {
      line_user_id = profile_line_user_id
      await debug_liff_event('liff_token_verify_completed', {
        visitor_uuid: cookie_visitor_uuid,
        line_user_id,
        skipped: true,
        reason: 'profile_payload_used',
      })
    } else {
      await emit_liff_auth_failed({
        ...debug_base,
        error_code: 'missing_auth_payload',
        error_message: 'Missing id_token or line_user_id',
        reason: 'missing_auth_payload',
      })

      return failure({
        error: 'Missing id_token or line_user_id',
        error_code: 'missing_auth_payload',
        http_status: 400,
      })
    }

    if (!is_allowed_line_user(line_user_id)) {
      await emit_liff_auth_failed({
        ...debug_base,
        line_user_id_exists: true,
        error_code: 'test_mode_blocked',
        error_message: 'LINE user is not allowed',
        reason: 'test_mode_blocked',
      })

      return failure({
        error: 'LINE user is not allowed',
        error_code: 'test_mode_blocked',
        http_status: 403,
      })
    }

    const result = await resolve_liff_login({
      request: input.request,
      line_user_id,
      display_name: profile_display_name,
      image_url: profile_image_url,
      browser_locale: null,
      visitor_uuid: cookie_visitor_uuid,
    })

    const { access, resolved_visitor_uuid, resolved_locale, identity_uuid } =
      result

    if (access.is_new_user) {
      await notify_new_user_created({
        provider: 'line',
        user_uuid: access.user_uuid,
        visitor_uuid: resolved_visitor_uuid,
        display_name: profile_display_name,
        locale: resolved_locale.locale ?? access.locale,
        is_new_user: access.is_new_user,
        is_new_visitor: access.is_new_visitor,
      })
    }

    await debug_liff_event('liff_auth_completed', {
      user_uuid: access.user_uuid,
      visitor_uuid: resolved_visitor_uuid,
      line_user_id,
      identity_uuid,
      locale: resolved_locale.locale,
      is_new_user: access.is_new_user,
    })

    return {
      ok: true,
      user_uuid: access.user_uuid,
      visitor_uuid: resolved_visitor_uuid,
      identity_uuid,
      is_new_user: access.is_new_user,
      is_new_visitor: access.is_new_visitor,
      locale: resolved_locale.locale,
      provider: 'line',
      session_restored: true,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await emit_liff_auth_failed({
      ...debug_base,
      line_user_id_exists: Boolean(line_user_id),
      error_code: 'exception',
      error_message: message,
      reason: 'exception',
      error: serialize_error(error),
    })

    return failure({
      error: 'LIFF auth failed',
      error_code: 'exception',
      http_status: 500,
    })
  }
}
