import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { run_auth_link_start } from '@/lib/auth/link/action'
import { driver_link_debug_event } from '@/lib/driver/debug'
import {
  line_link_return_path_cookie_name,
  line_link_return_path_cookie_options,
  normalize_line_link_return_path,
} from '@/lib/auth/link/return_path'
import { clean_uuid } from '@/lib/db/uuid/payload'
import {
  client_visitor_header_name,
  resolved_visitor_request_header_name,
  visitor_cookie_name,
} from '@/lib/visitor/cookie'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const return_path = normalize_line_link_return_path(
    url.searchParams.get('return_path'),
  )
  const cookie_store = await cookies()
  const header_store = await headers()
  const visitor_uuid =
    clean_uuid(cookie_store.get(visitor_cookie_name)?.value ?? null) ??
    clean_uuid(header_store.get(client_visitor_header_name)) ??
    clean_uuid(header_store.get(resolved_visitor_request_header_name))

  const result = await run_auth_link_start({
    body: {
      provider: 'line',
      return_path,
      source_channel: 'web',
    },
    visitor_uuid,
  })

  if (!result.ok) {
    await driver_link_debug_event({
      event: 'line_link_failed',
      payload: {
        user_uuid: result.user_uuid ?? null,
        role: null,
        return_path,
        error_code: result.error_code,
        error_message: result.error_message,
      },
    })

    return NextResponse.redirect(new URL('/entry?reason=no_line', url.origin))
  }

  const response = NextResponse.redirect(result.auth_url)

  if (return_path) {
    response.cookies.set(
      line_link_return_path_cookie_name,
      return_path,
      line_link_return_path_cookie_options(),
    )
  }

  return response
}
