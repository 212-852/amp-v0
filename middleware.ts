import { NextRequest, NextResponse } from 'next/server'

import { is_public_asset_path } from '@/lib/auth/context'
import {
  get_browser_session_cookie_options,
  mint_visitor_uuid,
  visitor_cookie_max_age,
} from '@/lib/auth/session'
import { env } from '@/lib/config/env'
import {
  resolved_visitor_request_header_name,
  visitor_cookie_name,
} from '@/lib/visitor/cookie'

function read_browser_session_cookie_values(
  visitor_cookie: string | null | undefined,
) {
  return {
    visitor_uuid: visitor_cookie ?? null,
  }
}

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
  request_headers.delete(resolved_visitor_request_header_name)
  const existing = read_browser_session_cookie_values(
    request.cookies.get(visitor_cookie_name)?.value,
  )
  const should_create_guest_visitor =
    !existing.visitor_uuid &&
    (request.nextUrl.pathname === '/' ||
      request.nextUrl.pathname === '/user')
  const visitor_uuid =
    existing.visitor_uuid ??
    (should_create_guest_visitor ? mint_visitor_uuid() : null)

  if (visitor_uuid) {
    request_headers.set(resolved_visitor_request_header_name, visitor_uuid)
    append_request_cookie(
      request_headers,
      visitor_cookie_name,
      visitor_uuid,
    )
  }

  if (should_create_guest_visitor) {
    request_headers.set('x-amp-visitor-cookie-created', '1')
  }

  const response = response_builder(request_headers)

  if (should_create_guest_visitor && visitor_uuid) {
    response.cookies.set(
      visitor_cookie_name,
      visitor_uuid,
      get_browser_session_cookie_options(visitor_cookie_max_age),
    )
  }

  return response
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const pathname = request.nextUrl.pathname
  const is_local = is_local_host(host)
  const is_api = pathname.startsWith('/api')
  const skip_visitor_cookie_forward =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    is_public_asset_path(pathname) ||
    pathname.startsWith('/api/webhook')

  if (skip_visitor_cookie_forward) {
    return NextResponse.next()
  }

  const next_with_visitor_cookie = () =>
    create_response(request, (headers) =>
      NextResponse.next({
        request: { headers },
      }),
    )

  if (is_local) {
    return next_with_visitor_cookie()
  }

  if (host === env.domain.platform) {
    return next_with_visitor_cookie()
  }

  if (host === env.domain.corporate) {
    if (is_api) {
      return next_with_visitor_cookie()
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
      return next_with_visitor_cookie()
    }

    const url = request.nextUrl.clone()
    url.pathname = `/airport${pathname}`

    return create_response(request, (headers) =>
      NextResponse.rewrite(url, {
        request: { headers },
      }),
    )
  }

  return next_with_visitor_cookie()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
