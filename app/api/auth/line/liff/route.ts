import { NextResponse } from 'next/server'

import { run_liff_line_auth } from '@/lib/auth/liff/action'
import {
  get_browser_session_cookie_options,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import { emit_liff_auth_failed } from '@/lib/auth/liff/debug'
import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

export async function POST(request: Request) {
  let body: Record<string, unknown>

  try {
    body = (await request.json()) as Record<string, unknown>
  } catch (error) {
    await emit_liff_auth_failed({
      error_code: 'payload_parse_failed',
      error_message:
        error instanceof Error ? error.message : 'Invalid JSON payload',
      reason: 'payload_parse_failed',
    })

    return NextResponse.json(
      { ok: false, error: 'Invalid JSON payload', error_code: 'payload_parse_failed' },
      { status: 400 },
    )
  }

  const result = await run_liff_line_auth({
    request,
    body: {
      id_token:
        typeof body.id_token === 'string' ? body.id_token : null,
      line_user_id:
        typeof body.line_user_id === 'string' ? body.line_user_id : null,
      display_name:
        typeof body.display_name === 'string' ? body.display_name : null,
      picture_url:
        typeof body.picture_url === 'string' ? body.picture_url : null,
      image_url: typeof body.image_url === 'string' ? body.image_url : null,
      source_channel:
        typeof body.source_channel === 'string' ? body.source_channel : null,
      return_path:
        typeof body.return_path === 'string' ? body.return_path : null,
      current_url:
        typeof body.current_url === 'string' ? body.current_url : null,
      pathname: typeof body.pathname === 'string' ? body.pathname : null,
      search: typeof body.search === 'string' ? body.search : null,
    },
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        error_code: result.error_code,
      },
      { status: result.http_status },
    )
  }

  const response = NextResponse.json({
    ok: true,
    user_uuid: result.user_uuid,
    visitor_uuid: result.visitor_uuid,
    identity_uuid: result.identity_uuid,
    is_new_user: result.is_new_user,
    is_new_visitor: result.is_new_visitor,
    locale: result.locale,
    provider: result.provider,
    session_restored: result.session_restored,
  })

  const cookie_opts = get_browser_session_cookie_options(visitor_cookie_max_age)

  response.cookies.set(visitor_cookie_name, result.visitor_uuid, cookie_opts)
  response.cookies.set(browser_channel_cookie_name, 'liff', cookie_opts)

  return response
}
