import { NextRequest, NextResponse } from 'next/server'

import {
  read_browser_session_cookie_values,
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
  const existing = read_browser_session_cookie_values(
    request.cookies.get(visitor_cookie_name)?.value,
  )

  if (existing.visitor_uuid) {
    append_request_cookie(
      request_headers,
      visitor_cookie_name,
      existing.visitor_uuid,
    )
  }

  const response = response_builder(request_headers)

  return response
}

function is_public_asset_path(pathname: string) {
  if (
    pathname.startsWith('/images/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/fonts/')
  ) {
    return true
  }

  return /\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|png|svg|txt|webmanifest|webp|woff2?)$/i.test(
    pathname,
  )
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
