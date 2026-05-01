import { NextRequest, NextResponse } from 'next/server'

import { env } from '@/lib/config/env'

const is_local_host = (host: string) => {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
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
    return NextResponse.next()
  }

  if (host === env.domain.platform) {
    return NextResponse.next()
  }

  if (host === env.domain.corporate) {
    const url = request.nextUrl.clone()
    url.pathname = `/corporate${pathname}`
    return NextResponse.rewrite(url)
  }

  if (host === env.domain.airport) {
    const url = request.nextUrl.clone()
    url.pathname = `/airport${pathname}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}