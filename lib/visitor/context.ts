import 'server-only'

import { cookies } from 'next/headers'

import {
  type browser_access_platform,
  type browser_session_caller,
  type browser_session_source_channel,
  get_browser_session_cookie_options,
  track_session_resolution,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'

export {
  session_cookie_name,
  visitor_cookie_name,
} from '@/lib/visitor/cookie'

export type session_source_channel = browser_session_source_channel

export type visitor_context = {
  visitor_uuid: string
  session_uuid: string
  is_new_visitor: boolean
  is_new_session: boolean
  cookie_exists: boolean
  session_exists: boolean
}

type visitor_context_options = {
  locale?: string | null
  user_agent?: string | null
  access_platform?: browser_access_platform
}

export async function bind_visitor_session(visitor_uuid: string) {
  const cookie_store = await cookies()

  cookie_store.set(
    visitor_cookie_name,
    visitor_uuid,
    get_browser_session_cookie_options(visitor_cookie_max_age),
  )
}

export async function resolve_visitor_context(
  source_channel: session_source_channel,
  caller: browser_session_caller = 'unknown',
  options: visitor_context_options = {},
): Promise<visitor_context> {
  return track_session_resolution(
    caller,
    source_channel,
    options.locale ?? null,
    options.user_agent ?? null,
    options.access_platform ?? 'unknown',
  )
}
