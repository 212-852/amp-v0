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

export function get_browser_session_cookie_options(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

export type browser_session_cookie_input = {
  visitor_cookie: string | null | undefined
  session_cookie: string | null | undefined
}

export type resolved_browser_session = {
  visitor_uuid: string
  session_uuid: string
  is_new_visitor: boolean
  is_new_session: boolean
}

/**
 * Single place that may mint browser visitor_uuid / session_uuid cookies.
 */
export function resolve_browser_session_from_cookies(
  input: browser_session_cookie_input,
): resolved_browser_session {
  const is_new_visitor = !input.visitor_cookie
  const is_new_session = !input.session_cookie
  const visitor_uuid = input.visitor_cookie ?? new_uuid()
  const session_uuid = input.session_cookie ?? new_uuid()

  return {
    visitor_uuid,
    session_uuid,
    is_new_visitor,
    is_new_session,
  }
}
