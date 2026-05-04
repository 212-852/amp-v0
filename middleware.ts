import { NextRequest, NextResponse } from 'next/server'

import { env } from '@/lib/config/env'
import {
  session_cookie_name,
  visitor_cookie_name,
} from '@/lib/visitor/cookie'

const visitor_cookie_age = 60 * 60 * 24 * 365
const session_cookie_age = 60 * 60 * 24

const is_local_host = (host: string) => {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

function get_cookie_options(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
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
  const visitor_uuid =
    request.cookies.get(visitor_cookie_name)?.value ?? crypto.randomUUID()
  const session_uuid =
    request.cookies.get(session_cookie_name)?.value ?? crypto.randomUUID()
  const needs_visitor_cookie =
    !request.cookies.get(visitor_cookie_name)?.value
  const needs_session_cookie =
    !request.cookies.get(session_cookie_name)?.value

  if (needs_visitor_cookie) {
    append_request_cookie(
      request_headers,
      visitor_cookie_name,
      visitor_uuid,
    )
  }

  if (needs_session_cookie) {
    append_request_cookie(
      request_headers,
      session_cookie_name,
      session_uuid,
    )
  }

  const response = response_builder(request_headers)

  if (needs_visitor_cookie) {
    response.cookies.set(
      visitor_cookie_name,
      visitor_uuid,
      get_cookie_options(visitor_cookie_age),
    )
  }

  if (needs_session_cookie) {
    response.cookies.set(
      session_cookie_name,
      session_uuid,
      get_cookie_options(session_cookie_age),
    )
  }

  return response
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const pathname = request.nextUrl.pathname
  const is_local = is_local_host(host)

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next()
  }

  if (is_local) {
    return create_response(request, (headers) =>
      NextResponse.next({
        request: { headers },
      }),
    )
  }

  if (host === env.domain.platform) {
    return create_response(request, (headers) =>
      NextResponse.next({
        request: { headers },
      }),
    )
  }

  if (host === env.domain.corporate) {
    const url = request.nextUrl.clone()
    url.pathname = `/corporate${pathname}`

    return create_response(request, (headers) =>
      NextResponse.rewrite(url, {
        request: { headers },
      }),
    )
  }

  if (host === env.domain.airport) {
    const url = request.nextUrl.clone()
    url.pathname = `/airport${pathname}`

    return create_response(request, (headers) =>
      NextResponse.rewrite(url, {
        request: { headers },
      }),
    )
  }

  return create_response(request, (headers) =>
    NextResponse.next({
      request: { headers },
    }),
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
