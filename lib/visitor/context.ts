import 'server-only'

import { cookies } from 'next/headers'
import { cache } from 'react'

import {
  type browser_access_platform,
  type browser_session_caller,
  type browser_session_source_channel,
  get_browser_session_cookie_options,
  resolve_browser_session,
  session_cookie_max_age,
  session_cookie_name,
  visitor_cookie_max_age,
  visitor_cookie_name,
} from '@/lib/auth/session'
import { control } from '@/lib/config/control'
import { debug_event } from '@/lib/debug'

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

async function resolve_visitor_context_impl(
  source_channel: session_source_channel,
  caller: browser_session_caller = 'unknown',
  options: visitor_context_options = {},
): Promise<visitor_context> {
  const cookie_store = await cookies()
  const current_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null
  const current_session_uuid =
    cookie_store.get(session_cookie_name)?.value ?? null
  const session = await resolve_browser_session({
    visitor_uuid: current_visitor_uuid,
    session_uuid: current_session_uuid,
    caller,
    source_channel,
    locale: options.locale,
    user_agent: options.user_agent,
    access_platform: options.access_platform,
  })

  if (current_visitor_uuid !== session.visitor_uuid) {
    cookie_store.set(
      visitor_cookie_name,
      session.visitor_uuid,
      get_browser_session_cookie_options(visitor_cookie_max_age),
    )
  }

  if (current_session_uuid !== session.session_uuid) {
    cookie_store.set(
      session_cookie_name,
      session.session_uuid,
      get_browser_session_cookie_options(session_cookie_max_age),
    )
  }

  return session
}

/**
 * One browser session resolution per React request (dedupes parallel RSC work).
 * visitor_uuid / session_uuid are minted only by lib/auth/session.ts.
 */
export const resolve_visitor_context = cache(resolve_visitor_context_impl)

export async function emit_visitor_access_debug(input: {
  event:
    | 'visitor_create_conflict'
    | 'visitor_reused_after_conflict'
    | 'session_create_conflict'
    | 'session_reused_after_conflict'
  visitor_uuid: string | null
  session_uuid: string | null
  user_uuid: string | null
  source_channel: session_source_channel
}) {
  if (!control.debug.visitor_context) {
    return
  }

  await debug_event({
    category: 'session',
    event: input.event,
    payload: {
      caller: 'unknown',
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
      source_channel: input.source_channel,
      session_uuid: input.session_uuid,
      cookie_exists: Boolean(input.visitor_uuid),
      session_exists: Boolean(input.session_uuid),
      created: false,
    },
  })
}
