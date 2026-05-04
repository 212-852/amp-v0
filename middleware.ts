import { NextRequest, NextResponse } from 'next/server'

import {
  get_browser_session_cookie_options,
  resolve_browser_session_from_cookies,
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

function create_response(
  request: NextRequest,
  response_builder: (headers: Headers) => NextResponse,
) {
  const request_headers = new Headers(request.headers)
  const resolved = resolve_browser_session_from_cookies({
    visitor_cookie: request.cookies.get(visitor_cookie_name)?.value,
    session_cookie: request.cookies.get(session_cookie_name)?.value,
  })
  const needs_visitor_cookie = resolved.is_new_visitor
  const needs_session_cookie = resolved.is_new_session

  if (needs_visitor_cookie) {
    append_request_cookie(
      request_headers,
      visitor_cookie_name,
      resolved.visitor_uuid,
    )
  }

  if (needs_session_cookie) {
    append_request_cookie(
      request_headers,
      session_cookie_name,
      resolved.session_uuid,
    )
  }

  const response = response_builder(request_headers)

  if (needs_visitor_cookie) {
    response.cookies.set(
      visitor_cookie_name,
      resolved.visitor_uuid,
      get_browser_session_cookie_options(visitor_cookie_max_age),
    )
  }

  if (needs_session_cookie) {
    response.cookies.set(
      session_cookie_name,
      resolved.session_uuid,
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
  const skip_session_cookies =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/webhook')

  if (skip_session_cookies) {
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
