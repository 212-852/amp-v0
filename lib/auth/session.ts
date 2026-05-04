import {
  session_cookie_name,
  visitor_cookie_name,
} from '@/lib/visitor/cookie'

export { session_cookie_name, visitor_cookie_name } from '@/lib/visitor/cookie'

export const visitor_cookie_max_age = 60 * 60 * 24 * 365
export const session_cookie_max_age = 60 * 60 * 24

function new_uuid(): string {
  return globalThis.crypto.randomUUID()
}

/**
 * Only the auth/session layer may mint browser visitor_uuid (server: visitor/context).
 */
export function mint_visitor_uuid(): string {
  return new_uuid()
}

/**
 * Only the auth/session layer may mint browser session_uuid (server: visitor/context).
 */
export function mint_session_uuid(): string {
  return new_uuid()
}

export function get_browser_session_cookie_options(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

export type existing_browser_session_cookies = {
  visitor_uuid: string | null
  session_uuid: string | null
}

/**
 * Read cookie values only (no mint). Middleware forwards these to the request.
 */
export function read_browser_session_cookie_values(
  visitor_cookie: string | null | undefined,
  session_cookie: string | null | undefined,
): existing_browser_session_cookies {
  return {
    visitor_uuid: visitor_cookie ?? null,
    session_uuid: session_cookie ?? null,
  }
}
