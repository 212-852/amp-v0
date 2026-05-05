import 'server-only'

import {
  type browser_access_platform,
  type browser_session_caller,
  type browser_session_source_channel,
  track_session_resolution,
} from '@/lib/auth/session'

export { visitor_cookie_name } from '@/lib/visitor/cookie'

export type session_source_channel = browser_session_source_channel

export type visitor_context = {
  visitor_uuid: string | null
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
