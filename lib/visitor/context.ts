import 'server-only'

import { cookies } from 'next/headers'
import { cache } from 'react'

import {
  get_browser_session_cookie_options,
  mint_session_uuid,
  mint_visitor_uuid,
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

export type session_source_channel = 'web' | 'liff' | 'pwa'

export type visitor_context = {
  visitor_uuid: string
  session_uuid: string
  is_new_visitor: boolean
  is_new_session: boolean
}

type session_debug_event =
  | 'session_lookup_started'
  | 'session_reused'
  | 'session_created'
  | 'session_create_conflict'
  | 'session_reused_after_conflict'
  | 'visitor_reused'
  | 'visitor_created'
  | 'visitor_create_conflict'
  | 'visitor_reused_after_conflict'

async function emit_session_debug(input: {
  event: session_debug_event
  visitor_uuid: string | null
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

async function resolve_visitor_context_impl(
  source_channel: session_source_channel,
): Promise<visitor_context> {
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

  let visitor_uuid = current_visitor_uuid
  let session_uuid = current_session_uuid
  let is_new_visitor = false
  let is_new_session = false

  if (!visitor_uuid) {
    visitor_uuid = mint_visitor_uuid()
    is_new_visitor = true
    cookie_store.set(
      visitor_cookie_name,
      visitor_uuid,
      get_browser_session_cookie_options(visitor_cookie_max_age),
    )

    await emit_session_debug({
      event: 'visitor_created',
      visitor_uuid,
      user_uuid: null,
      source_channel,
    })
  } else {
    await emit_session_debug({
      event: 'visitor_reused',
      visitor_uuid,
      user_uuid: null,
      source_channel,
    })
  }

  if (!session_uuid) {
    session_uuid = mint_session_uuid()
    is_new_session = true
    cookie_store.set(
      session_cookie_name,
      session_uuid,
      get_browser_session_cookie_options(session_cookie_max_age),
    )

    await emit_session_debug({
      event: 'session_created',
      visitor_uuid,
      user_uuid: null,
      source_channel,
    })
  } else {
    await emit_session_debug({
      event: 'session_reused',
      visitor_uuid,
      user_uuid: null,
      source_channel,
    })
  }

  return {
    visitor_uuid,
    session_uuid,
    is_new_visitor,
    is_new_session,
  }
}

/**
 * One browser session resolution per React request (dedupes parallel RSC work).
 * visitor_uuid / session_uuid are minted only here via lib/auth/session.ts.
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
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
      source_channel: input.source_channel,
      session_uuid: input.session_uuid,
    },
  })
}
