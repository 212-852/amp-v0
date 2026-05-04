import { NextRequest, NextResponse } from 'next/server'

import {
  get_browser_session_cookie_options,
  read_browser_session_cookie_values,
  session_cookie_max_age,
  session_cookie_name,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import { env } from '@/lib/config/env'

const is_local_host = (host: string) => {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

function append_request_cookie(
  headers: Headers,
  name: string,
  value: string,
) {
  const current_cookie = headers.get('cookie')
  const next_cookie = `${name}=${value}`

  headers.set(
    'cookie',
    current_cookie ? `${current_cookie}; ${next_cookie}` : next_cookie,
  )
}

/**
 * Forward existing httpOnly cookies into the request. Do not mint visitor/session
 * (single path: server resolve_visitor_context + lib/auth/session.ts).
 */
function create_response(
  request: NextRequest,
  response_builder: (headers: Headers) => NextResponse,
) {
  const request_headers = new Headers(request.headers)
  const existing = read_browser_session_cookie_values(
    request.cookies.get(visitor_cookie_name)?.value,
    request.cookies.get(session_cookie_name)?.value,
  )

  if (existing.visitor_uuid) {
    append_request_cookie(
      request_headers,
      visitor_cookie_name,
      existing.visitor_uuid,
    )
  }

  if (existing.session_uuid) {
    append_request_cookie(
      request_headers,
      session_cookie_name,
      existing.session_uuid,
    )
  }

  const response = response_builder(request_headers)

  if (existing.visitor_uuid) {
    response.cookies.set(
      visitor_cookie_name,
      existing.visitor_uuid,
      get_browser_session_cookie_options(visitor_cookie_max_age),
    )
  }

  if (existing.session_uuid) {
    response.cookies.set(
      session_cookie_name,
      existing.session_uuid,
      get_browser_session_cookie_options(session_cookie_max_age),
    )
  }

  return response
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const pathname = request.nextUrl.pathname
  const is_local = is_local_host(host)
  const is_api = pathname.startsWith('/api')
  const skip_session_forward =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/webhook')

  if (skip_session_forward) {
    return NextResponse.next()
  }

  const next_with_session = () =>
    create_response(request, (headers) =>
      NextResponse.next({
        request: { headers },
      }),
    )

  if (is_local) {
    return next_with_session()
  }

  if (host === env.domain.platform) {
    return next_with_session()
  }

  if (host === env.domain.corporate) {
    if (is_api) {
      return next_with_session()
    }

    const url = request.nextUrl.clone()
    url.pathname = `/corporate${pathname}`

    return create_response(request, (headers) =>
      NextResponse.rewrite(url, {
        request: { headers },
      }),
    )
  }

  if (host === env.domain.airport) {
    if (is_api) {
      return next_with_session()
    }

    const url = request.nextUrl.clone()
    url.pathname = `/airport${pathname}`

    return create_response(request, (headers) =>
      NextResponse.rewrite(url, {
        request: { headers },
      }),
    )
  }

  return next_with_session()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
