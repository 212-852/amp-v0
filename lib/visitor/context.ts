import 'server-only'

import { cookies } from 'next/headers'

import {
  get_browser_session_cookie_options,
  resolve_browser_session_from_cookies,
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

export type visitor_context = {
  visitor_uuid: string
  session_uuid: string
  is_new_visitor: boolean
  is_new_session: boolean
}

type resolve_visitor_options = {
  source_channel?: 'web' | 'liff' | 'pwa'
}

async function emit_session_debug(input: {
  event:
    | 'session_lookup_started'
    | 'session_reused'
    | 'session_created'
    | 'visitor_reused'
    | 'visitor_created'
  visitor_uuid: string | null
  user_uuid: string | null
  source_channel: 'web' | 'liff' | 'pwa'
}) {
  if (!control.debug.visitor_context) {
    return
  }

  await debug_event({
    category: 'session',
    event: input.event,
    payload: {
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
      source_channel: input.source_channel,
    },
  })
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
  options?: resolve_visitor_options,
): Promise<visitor_context> {
  const source_channel = options?.source_channel ?? 'web'
  const cookie_store = await cookies()
  const current_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null
  const current_session_uuid =
    cookie_store.get(session_cookie_name)?.value ?? null

  await emit_session_debug({
    event: 'session_lookup_started',
    visitor_uuid: current_visitor_uuid,
    user_uuid: null,
    source_channel,
  })

  const resolved = resolve_browser_session_from_cookies({
    visitor_cookie: current_visitor_uuid,
    session_cookie: current_session_uuid,
  })

  if (resolved.is_new_visitor) {
    cookie_store.set(
      visitor_cookie_name,
      resolved.visitor_uuid,
      get_browser_session_cookie_options(visitor_cookie_max_age),
    )

    await emit_session_debug({
      event: 'visitor_created',
      visitor_uuid: resolved.visitor_uuid,
      user_uuid: null,
      source_channel,
    })
  } else {
    await emit_session_debug({
      event: 'visitor_reused',
      visitor_uuid: resolved.visitor_uuid,
      user_uuid: null,
      source_channel,
    })
  }

  if (resolved.is_new_session) {
    cookie_store.set(
      session_cookie_name,
      resolved.session_uuid,
      get_browser_session_cookie_options(session_cookie_max_age),
    )

    await emit_session_debug({
      event: 'session_created',
      visitor_uuid: resolved.visitor_uuid,
      user_uuid: null,
      source_channel,
    })
  } else {
    await emit_session_debug({
      event: 'session_reused',
      visitor_uuid: resolved.visitor_uuid,
      user_uuid: null,
      source_channel,
    })
  }

  return {
    visitor_uuid: resolved.visitor_uuid,
    session_uuid: resolved.session_uuid,
    is_new_visitor: resolved.is_new_visitor,
    is_new_session: resolved.is_new_session,
  }
}
