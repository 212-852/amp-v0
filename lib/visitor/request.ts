import 'server-only'

import { cookies, headers } from 'next/headers'

import {
  resolved_visitor_request_header_name,
  visitor_cookie_name,
} from '@/lib/visitor/cookie'

/**
 * Visitor UUID for this request: cookie first, then middleware-forwarded header.
 * The header is set only by middleware (incoming client values are stripped there).
 */
export async function get_request_visitor_uuid(): Promise<string | null> {
  const cookie_store = await cookies()
  const header_store = await headers()
  const from_cookie =
    cookie_store.get(visitor_cookie_name)?.value?.trim() ?? null

  if (from_cookie) {
    return from_cookie
  }

  const from_header =
    header_store.get(resolved_visitor_request_header_name)?.trim() ?? null

  return from_header || null
}
