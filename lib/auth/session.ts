import { cache } from 'react'

import { control } from '@/lib/config/control'
import {
  session_cookie_name,
  visitor_cookie_name,
} from '@/lib/visitor/cookie'

export { session_cookie_name, visitor_cookie_name }

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

export type browser_session_caller =
  | 'page'
  | 'api_session'
  | 'dispatch_context'
  | 'line_callback'
  | 'line_webhook'
  | 'chat_room'
  | 'unknown'

export type browser_session_source_channel = 'web' | 'liff' | 'pwa'

export type browser_access_platform =
  | 'ios'
  | 'android'
  | 'mac'
  | 'windows'
  | 'unknown'

export type browser_session_input = {
  visitor_uuid: string | null
  session_uuid: string | null
  caller?: browser_session_caller
  source_channel?: browser_session_source_channel
  locale?: string | null
  user_agent?: string | null
  access_platform?: browser_access_platform
}

export type browser_session_result = {
  visitor_uuid: string
  session_uuid: string
  is_new_visitor: boolean
  is_new_session: boolean
  cookie_exists: boolean
  session_exists: boolean
}

export type read_session_result = {
  visitor_uuid: string | null
  session_uuid: string | null
  is_new_visitor: false
  is_new_session: false
  cookie_exists: boolean
  session_exists: boolean
}

export type identity_promotion_result = {
  visitor_uuid: string
  user_uuid: string
  existing_room_uuid: string | null
  participant_uuid: string | null
  promoted: boolean
}

export type user_visitor_result = {
  visitor_uuid: string
  is_new_visitor: boolean
}

function is_unique_violation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  return (error as { code?: string }).code === '23505'
}

async function get_supabase() {
  const database = await import('@/lib/db/supabase')

  return database.supabase
}

function infer_source_channel_from_ua(
  user_agent: string | null | undefined,
): browser_session_source_channel {
  const ua = user_agent?.toLowerCase() ?? ''

  if (ua.includes('line/')) {
    return 'liff'
  }

  return 'web'
}

async function resolve_visitor_user_uuid(
  visitor_uuid: string,
): Promise<string | null> {
  const supabase = await get_supabase()
  const row = await supabase
    .from('visitors')
    .select('user_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()

  if (row.error) {
    throw row.error
  }

  return row.data?.user_uuid ?? null
}

export type session_core_debug_payload = {
  caller: browser_session_caller
  cookie_key: string
  cookie_exists: boolean
  cookie_visitor_uuid: string | null
  resolved_visitor_uuid: string | null
  user_uuid: string | null
  source_channel: browser_session_source_channel
  created: boolean
  reused: boolean
  error_code: string | null
  error_message: string | null
}

async function emit_session_core_event(
  event: string,
  partial: Partial<session_core_debug_payload> & {
    caller?: browser_session_caller
  },
) {
  if (!control.debug.session_core) {
    return
  }

  const { debug_event } = await import('@/lib/debug')

  const payload: session_core_debug_payload = {
    caller: partial.caller ?? 'unknown',
    cookie_key: partial.cookie_key ?? visitor_cookie_name,
    cookie_exists: partial.cookie_exists ?? false,
    cookie_visitor_uuid: partial.cookie_visitor_uuid ?? null,
    resolved_visitor_uuid: partial.resolved_visitor_uuid ?? null,
    user_uuid: partial.user_uuid ?? null,
    source_channel: partial.source_channel ?? 'web',
    created: partial.created ?? false,
    reused: partial.reused ?? false,
    error_code: partial.error_code ?? null,
    error_message: partial.error_message ?? null,
  }

  await debug_event({
    category: 'session',
    event,
    payload,
  })
}

async function emit_identity_promotion_debug(
  event:
    | 'identity_promote_started'
    | 'visitor_promoted_to_user'
    | 'session_promoted'
    | 'existing_guest_room_found'
    | 'guest_room_reused_for_user'
    | 'identity_promote_finished',
  payload: {
    old_visitor_uuid: string | null
    user_uuid: string
    existing_room_uuid?: string | null
    participant_uuid?: string | null
  },
) {
  if (!control.debug.identity_promotion) {
    return
  }

  const { debug_event } = await import('@/lib/debug')

  await debug_event({
    category: 'session',
    event,
    payload: {
      old_visitor_uuid: payload.old_visitor_uuid,
      user_uuid: payload.user_uuid,
      existing_room_uuid: payload.existing_room_uuid ?? null,
      participant_uuid: payload.participant_uuid ?? null,
    },
  })
}

async function find_visitor_row(
  supabase: Awaited<ReturnType<typeof get_supabase>>,
  visitor_uuid: string,
) {
  return supabase
    .from('visitors')
    .select('visitor_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()
}

async function find_visitor_by_user(
  supabase: Awaited<ReturnType<typeof get_supabase>>,
  user_uuid: string,
) {
  return supabase
    .from('visitors')
    .select('visitor_uuid')
    .eq('user_uuid', user_uuid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

async function emit_visitor_conflict_debug(input: {
  event:
    | 'session_visitor_create_conflict'
    | 'session_visitor_reused_after_conflict'
  caller?: browser_session_caller
  visitor_uuid: string | null
  session_uuid: string | null
  user_uuid: string | null
  source_channel?: browser_session_source_channel
  error_code?: string | null
  error_message?: string | null
}) {
  await emit_session_core_event(input.event, {
    caller: input.caller ?? 'unknown',
    cookie_exists: Boolean(input.visitor_uuid),
    cookie_visitor_uuid: input.visitor_uuid,
    resolved_visitor_uuid: input.visitor_uuid,
    user_uuid: input.user_uuid,
    source_channel: input.source_channel ?? 'web',
    created: false,
    reused: true,
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
  })
}

async function find_visitor_row_after_conflict(input: {
  supabase: Awaited<ReturnType<typeof get_supabase>>
  visitor_uuid: string
}) {
  const max_attempts = 3

  for (let attempt = 1; attempt <= max_attempts; attempt += 1) {
    const result = await find_visitor_row(
      input.supabase,
      input.visitor_uuid,
    )

    if (result.error) {
      throw result.error
    }

    if (result.data?.visitor_uuid) {
      return result.data.visitor_uuid
    }

    if (attempt < max_attempts) {
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt))
    }
  }

  return input.visitor_uuid
}

async function find_user_visitor_after_conflict(input: {
  supabase: Awaited<ReturnType<typeof get_supabase>>
  user_uuid: string
}) {
  const max_attempts = 3

  for (let attempt = 1; attempt <= max_attempts; attempt += 1) {
    const result = await find_visitor_by_user(
      input.supabase,
      input.user_uuid,
    )

    if (result.error) {
      throw result.error
    }

    if (result.data?.visitor_uuid) {
      return result.data.visitor_uuid
    }

    if (attempt < max_attempts) {
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt))
    }
  }

  throw new Error('visitor unique conflict could not be reselected')
}

async function attach_preferred_visitor(input: {
  supabase: Awaited<ReturnType<typeof get_supabase>>
  visitor_uuid: string
  user_uuid: string
}) {
  const updated = await input.supabase
    .from('visitors')
    .update({
      user_uuid: input.user_uuid,
      updated_at: new Date().toISOString(),
    })
    .eq('visitor_uuid', input.visitor_uuid)
    .select('visitor_uuid')
    .maybeSingle()

  if (!updated.error && updated.data?.visitor_uuid) {
    return updated.data.visitor_uuid
  }

  if (updated.error && !is_unique_violation(updated.error)) {
    throw updated.error
  }

  const created = await input.supabase
    .from('visitors')
    .insert({
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
    })
    .select('visitor_uuid')
    .single()

  if (!created.error) {
    return created.data.visitor_uuid
  }

  if (!is_unique_violation(created.error)) {
    throw created.error
  }

  return input.visitor_uuid
}

async function create_user_visitor(input: {
  supabase: Awaited<ReturnType<typeof get_supabase>>
  user_uuid: string
}) {
  const created_visitor = await input.supabase
    .from('visitors')
    .insert({
      user_uuid: input.user_uuid,
    })
    .select('visitor_uuid')
    .single()

  if (!created_visitor.error) {
    return {
      visitor_uuid: created_visitor.data.visitor_uuid,
      is_new_visitor: true,
    }
  }

  if (!is_unique_violation(created_visitor.error)) {
    throw created_visitor.error
  }

  const reused_visitor_uuid = await find_user_visitor_after_conflict({
    supabase: input.supabase,
    user_uuid: input.user_uuid,
  })

  await emit_visitor_conflict_debug({
    event: 'session_visitor_create_conflict',
    visitor_uuid: reused_visitor_uuid,
    session_uuid: null,
    user_uuid: input.user_uuid,
    error_code: '23505',
    error_message: 'visitor insert unique violation',
  })

  await emit_visitor_conflict_debug({
    event: 'session_visitor_reused_after_conflict',
    visitor_uuid: reused_visitor_uuid,
    session_uuid: null,
    user_uuid: input.user_uuid,
  })

  return {
    visitor_uuid: reused_visitor_uuid,
    is_new_visitor: false,
  }
}

export async function resolve_user_visitor(input: {
  user_uuid: string
  visitor_uuid?: string | null
}): Promise<user_visitor_result> {
  const supabase = await get_supabase()

  if (input.visitor_uuid) {
    const visitor_uuid = await attach_preferred_visitor({
      supabase,
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
    })

    return {
      visitor_uuid,
      is_new_visitor: false,
    }
  }

  const existing_visitor = await find_visitor_by_user(
    supabase,
    input.user_uuid,
  )

  if (existing_visitor.error) {
    throw existing_visitor.error
  }

  if (existing_visitor.data?.visitor_uuid) {
    return {
      visitor_uuid: existing_visitor.data.visitor_uuid,
      is_new_visitor: false,
    }
  }

  return create_user_visitor({
    supabase,
    user_uuid: input.user_uuid,
  })
}

async function find_guest_participant_by_visitor(
  supabase: Awaited<ReturnType<typeof get_supabase>>,
  visitor_uuid: string,
) {
  const result = await supabase
    .from('participants')
    .select('participant_uuid, room_uuid')
    .eq('role', 'user')
    .is('user_uuid', null)
    .eq('visitor_uuid', visitor_uuid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data as
    | { participant_uuid: string; room_uuid: string | null }
    | null
}

async function ensure_browser_visitor(input: {
  supabase: Awaited<ReturnType<typeof get_supabase>>
  visitor_uuid: string
  source_channel: browser_session_source_channel
  caller: browser_session_caller
}) {
  await emit_session_core_event('session_visitor_lookup_started', {
    caller: input.caller,
    cookie_exists: true,
    cookie_visitor_uuid: input.visitor_uuid,
    resolved_visitor_uuid: input.visitor_uuid,
    user_uuid: null,
    source_channel: input.source_channel,
    created: false,
    reused: false,
    error_code: null,
    error_message: null,
  })

  const existing_visitor = await find_visitor_row(
    input.supabase,
    input.visitor_uuid,
  )

  if (existing_visitor.error) {
    throw existing_visitor.error
  }

  if (existing_visitor.data?.visitor_uuid) {
    await emit_session_core_event('session_visitor_lookup_found', {
      caller: input.caller,
      cookie_exists: true,
      cookie_visitor_uuid: input.visitor_uuid,
      resolved_visitor_uuid: input.visitor_uuid,
      user_uuid: null,
      source_channel: input.source_channel,
      created: false,
      reused: true,
      error_code: null,
      error_message: null,
    })

    const updated_visitor = await input.supabase
      .from('visitors')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('visitor_uuid', input.visitor_uuid)

    if (updated_visitor.error) {
      throw updated_visitor.error
    }

    return false
  }

  await emit_session_core_event('session_visitor_lookup_empty', {
    caller: input.caller,
    cookie_exists: true,
    cookie_visitor_uuid: input.visitor_uuid,
    resolved_visitor_uuid: input.visitor_uuid,
    user_uuid: null,
    source_channel: input.source_channel,
    created: false,
    reused: false,
    error_code: null,
    error_message: null,
  })

  await emit_session_core_event('session_visitor_create_started', {
    caller: input.caller,
    cookie_exists: true,
    cookie_visitor_uuid: input.visitor_uuid,
    resolved_visitor_uuid: input.visitor_uuid,
    user_uuid: null,
    source_channel: input.source_channel,
    created: true,
    reused: false,
    error_code: null,
    error_message: null,
  })

  const created_visitor = await input.supabase
    .from('visitors')
    .insert({
      visitor_uuid: input.visitor_uuid,
      user_uuid: null,
    })
    .select('visitor_uuid')
    .single()

  if (!created_visitor.error) {
    await emit_session_core_event('session_visitor_created', {
      caller: input.caller,
      cookie_exists: true,
      cookie_visitor_uuid: input.visitor_uuid,
      resolved_visitor_uuid: input.visitor_uuid,
      user_uuid: null,
      source_channel: input.source_channel,
      created: true,
      reused: false,
      error_code: null,
      error_message: null,
    })

    return true
  }

  if (!is_unique_violation(created_visitor.error)) {
    throw created_visitor.error
  }

  await emit_visitor_conflict_debug({
    event: 'session_visitor_create_conflict',
    caller: input.caller,
    visitor_uuid: input.visitor_uuid,
    session_uuid: null,
    user_uuid: null,
    source_channel: input.source_channel,
    error_code: '23505',
    error_message: 'visitor insert unique violation',
  })

  const reused_visitor_uuid = await find_visitor_row_after_conflict({
    supabase: input.supabase,
    visitor_uuid: input.visitor_uuid,
  })

  await emit_visitor_conflict_debug({
    event: 'session_visitor_reused_after_conflict',
    caller: input.caller,
    visitor_uuid: reused_visitor_uuid,
    session_uuid: null,
    user_uuid: null,
    source_channel: input.source_channel,
    error_code: null,
    error_message: null,
  })

  return false
}

async function find_session_row(
  supabase: Awaited<ReturnType<typeof get_supabase>>,
  session_uuid: string,
) {
  return supabase
    .from('sessions')
    .select('session_uuid')
    .eq('session_uuid', session_uuid)
    .maybeSingle()
}

async function ensure_browser_session(input: {
  supabase: Awaited<ReturnType<typeof get_supabase>>
  visitor_uuid: string
  session_uuid: string
  source_channel: browser_session_source_channel
  locale?: string | null
  user_agent?: string | null
  access_platform?: browser_access_platform
}) {
  const existing_session = await find_session_row(
    input.supabase,
    input.session_uuid,
  )
  const current_time = new Date().toISOString()

  if (existing_session.error) {
    throw existing_session.error
  }

  const session_payload = {
    visitor_uuid: input.visitor_uuid,
    access_channel: input.source_channel,
    access_platform: input.access_platform ?? 'unknown',
    locale: input.locale ?? null,
    user_agent: input.user_agent ?? null,
    last_seen_at: current_time,
    updated_at: current_time,
  }

  if (existing_session.data?.session_uuid) {
    const updated_session = await input.supabase
      .from('sessions')
      .update(session_payload)
      .eq('session_uuid', input.session_uuid)

    if (updated_session.error) {
      throw updated_session.error
    }

    return false
  }

  const created_session = await input.supabase
    .from('sessions')
    .insert({
      session_uuid: input.session_uuid,
      user_uuid: null,
      ...session_payload,
    })
    .select('session_uuid')
    .single()

  if (!created_session.error) {
    return true
  }

  if (!is_unique_violation(created_session.error)) {
    throw created_session.error
  }

  const after_conflict = await find_session_row(
    input.supabase,
    input.session_uuid,
  )

  if (after_conflict.error) {
    throw after_conflict.error
  }

  if (!after_conflict.data?.session_uuid) {
    throw created_session.error
  }

  const updated_session = await input.supabase
    .from('sessions')
    .update(session_payload)
    .eq('session_uuid', input.session_uuid)

  if (updated_session.error) {
    throw updated_session.error
  }

  return false
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

/**
 * DB + mint only. Called from `ensure_session` (api_session) exclusively.
 */
async function ensure_session_rows(
  input: browser_session_input,
): Promise<browser_session_result> {
  const visitor_uuid = input.visitor_uuid ?? mint_visitor_uuid()
  const session_uuid = input.session_uuid ?? mint_session_uuid()
  const cookie_exists = Boolean(input.visitor_uuid)
  const session_exists = Boolean(input.session_uuid)
  const source_channel = input.source_channel ?? 'web'
  const supabase = await get_supabase()
  const is_new_visitor = await ensure_browser_visitor({
    supabase,
    visitor_uuid,
    source_channel,
    caller: input.caller ?? 'unknown',
  })
  const is_new_session = await ensure_browser_session({
    supabase,
    visitor_uuid,
    session_uuid,
    source_channel,
    locale: input.locale,
    user_agent: input.user_agent,
    access_platform: input.access_platform,
  })

  return {
    visitor_uuid,
    session_uuid,
    is_new_visitor,
    is_new_session,
    cookie_exists,
    session_exists,
  }
}

/**
 * Request-level cache: cookies().get only. No DB writes, no cookies().set.
 */
export const read_session = cache(async (): Promise<read_session_result> => {
  const { cookies, headers } = await import('next/headers')
  const cookie_store = await cookies()
  const header_store = await headers()
  const user_agent = header_store.get('user-agent')
  const source_channel = infer_source_channel_from_ua(user_agent)

  const current_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null
  const current_session_uuid =
    cookie_store.get(session_cookie_name)?.value ?? null
  const cookie_exists = Boolean(current_visitor_uuid)
  const session_exists = Boolean(current_session_uuid)

  await emit_session_core_event(
    cookie_exists ? 'session_cookie_found' : 'session_cookie_missing',
    {
      caller: 'unknown',
      cookie_exists,
      cookie_visitor_uuid: current_visitor_uuid,
      resolved_visitor_uuid: current_visitor_uuid,
      user_uuid: null,
      source_channel,
      created: false,
      reused: cookie_exists,
      error_code: null,
      error_message: null,
    },
  )

  return {
    visitor_uuid: current_visitor_uuid,
    session_uuid: current_session_uuid,
    is_new_visitor: false,
    is_new_session: false,
    cookie_exists,
    session_exists,
  }
})

/**
 * Route-handler only (`app/api/session/route.ts`): DB rows + mint when cookies absent.
 * Does not call cookies().set.
 */
export async function ensure_session(input: browser_session_input) {
  const caller = input.caller ?? 'unknown'
  const source_channel = input.source_channel ?? 'web'

  if (caller !== 'api_session') {
    throw new Error('Session creation is only allowed from api_session')
  }

  const session = await ensure_session_rows(input)
  const created = session.is_new_visitor || session.is_new_session

  await emit_session_core_event(created ? 'session_created' : 'session_reused', {
    caller: 'api_session',
    cookie_exists: true,
    cookie_visitor_uuid: session.visitor_uuid,
    resolved_visitor_uuid: session.visitor_uuid,
    user_uuid: null,
    source_channel,
    created,
    reused: !created,
    error_code: null,
    error_message: null,
  })

  return session
}

export async function emit_session_cookie_write_event(
  event: 'session_cookie_set_started' | 'session_cookie_set_succeeded',
  input: {
    caller: browser_session_caller
    cookie_key: string
    visitor_uuid: string
    user_uuid?: string | null
    source_channel: browser_session_source_channel
  },
) {
  await emit_session_core_event(event, {
    caller: input.caller,
    cookie_key: input.cookie_key,
    cookie_exists: true,
    cookie_visitor_uuid:
      input.cookie_key === visitor_cookie_name ? input.visitor_uuid : null,
    resolved_visitor_uuid: input.visitor_uuid,
    user_uuid: input.user_uuid ?? null,
    source_channel: input.source_channel,
    created: false,
    reused: true,
    error_code: null,
    error_message: null,
  })
}

/**
 * Same as `read_session` plus caller-labeled debug events.
 * Safe for Server Components.
 */
export async function track_session_resolution(
  caller: browser_session_caller,
  source_channel: browser_session_source_channel = 'web',
  _locale?: string | null,
  _user_agent?: string | null,
  _access_platform?: browser_access_platform,
): Promise<read_session_result> {
  void _locale
  void _user_agent
  void _access_platform

  const { cookies } = await import('next/headers')
  const cookie_store = await cookies()
  const pre_v = cookie_store.get(visitor_cookie_name)?.value ?? null

  await emit_session_core_event('session_resolve_started', {
    caller,
    source_channel,
    cookie_exists: Boolean(pre_v),
    cookie_visitor_uuid: pre_v,
    resolved_visitor_uuid: pre_v,
    user_uuid: null,
    created: false,
    reused: Boolean(pre_v),
    error_code: null,
    error_message: null,
  })

  try {
    const session = await read_session()
    const user_uuid = session.visitor_uuid
      ? await resolve_visitor_user_uuid(session.visitor_uuid)
      : null

    await emit_session_core_event('session_resolve_finished', {
      caller,
      source_channel,
      cookie_exists: Boolean(pre_v),
      cookie_visitor_uuid: pre_v,
      resolved_visitor_uuid: session.visitor_uuid,
      user_uuid,
      created: false,
      reused: Boolean(session.visitor_uuid),
      error_code: null,
      error_message: null,
    })

    return session
  } catch (error) {
    const err = error as { code?: string; message?: string }

    await emit_session_core_event('session_resolve_finished', {
      caller,
      source_channel,
      cookie_exists: Boolean(pre_v),
      cookie_visitor_uuid: pre_v,
      resolved_visitor_uuid: null,
      user_uuid: null,
      created: false,
      reused: false,
      error_code: err.code ?? 'error',
      error_message: err.message ?? String(error),
    })

    throw error
  }
}

export async function promote_browser_visitor_to_user(input: {
  old_visitor_uuid: string | null
  session_uuid?: string | null
  user_uuid: string
}): Promise<identity_promotion_result> {
  const supabase = await get_supabase()
  const old_visitor_uuid = input.old_visitor_uuid

  await emit_identity_promotion_debug('identity_promote_started', {
    old_visitor_uuid,
    user_uuid: input.user_uuid,
  })

  if (!old_visitor_uuid) {
    await emit_identity_promotion_debug('identity_promote_finished', {
      old_visitor_uuid,
      user_uuid: input.user_uuid,
    })

    return {
      visitor_uuid: '',
      user_uuid: input.user_uuid,
      existing_room_uuid: null,
      participant_uuid: null,
      promoted: false,
    }
  }

  const guest_participant = await find_guest_participant_by_visitor(
    supabase,
    old_visitor_uuid,
  )

  if (guest_participant?.room_uuid) {
    await emit_identity_promotion_debug('existing_guest_room_found', {
      old_visitor_uuid,
      user_uuid: input.user_uuid,
      existing_room_uuid: guest_participant.room_uuid,
      participant_uuid: guest_participant.participant_uuid,
    })
  }

  const visitor_update = await supabase
    .from('visitors')
    .update({
      user_uuid: input.user_uuid,
      updated_at: new Date().toISOString(),
    })
    .eq('visitor_uuid', old_visitor_uuid)

  if (visitor_update.error && !is_unique_violation(visitor_update.error)) {
    throw visitor_update.error
  }

  const promotion_now = new Date().toISOString()

  if (guest_participant?.participant_uuid) {
    const cleared_member_slot = await supabase
      .from('participants')
      .update({
        user_uuid: null,
        updated_at: promotion_now,
      })
      .eq('role', 'user')
      .eq('status', 'active')
      .eq('user_uuid', input.user_uuid)
      .neq('participant_uuid', guest_participant.participant_uuid)

    if (cleared_member_slot.error) {
      throw cleared_member_slot.error
    }

    const participant_promotion = await supabase
      .from('participants')
      .update({
        user_uuid: input.user_uuid,
        updated_at: promotion_now,
      })
      .eq('participant_uuid', guest_participant.participant_uuid)

    if (participant_promotion.error) {
      throw participant_promotion.error
    }
  }

  await emit_identity_promotion_debug('visitor_promoted_to_user', {
    old_visitor_uuid,
    user_uuid: input.user_uuid,
    existing_room_uuid: guest_participant?.room_uuid ?? null,
    participant_uuid: guest_participant?.participant_uuid ?? null,
  })

  let session_update = supabase
    .from('sessions')
    .update({
      visitor_uuid: old_visitor_uuid,
      user_uuid: input.user_uuid,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })

  if (input.session_uuid) {
    session_update = session_update.eq('session_uuid', input.session_uuid)
  } else {
    session_update = session_update.eq('visitor_uuid', old_visitor_uuid)
  }

  const session_result = await session_update

  if (session_result.error) {
    throw session_result.error
  }

  await emit_identity_promotion_debug('session_promoted', {
    old_visitor_uuid,
    user_uuid: input.user_uuid,
    existing_room_uuid: guest_participant?.room_uuid ?? null,
    participant_uuid: guest_participant?.participant_uuid ?? null,
  })

  if (guest_participant?.room_uuid) {
    await emit_identity_promotion_debug('guest_room_reused_for_user', {
      old_visitor_uuid,
      user_uuid: input.user_uuid,
      existing_room_uuid: guest_participant.room_uuid,
      participant_uuid: guest_participant.participant_uuid,
    })
  }

  await emit_identity_promotion_debug('identity_promote_finished', {
    old_visitor_uuid,
    user_uuid: input.user_uuid,
    existing_room_uuid: guest_participant?.room_uuid ?? null,
    participant_uuid: guest_participant?.participant_uuid ?? null,
  })

  return {
    visitor_uuid: old_visitor_uuid,
    user_uuid: input.user_uuid,
    existing_room_uuid: guest_participant?.room_uuid ?? null,
    participant_uuid: guest_participant?.participant_uuid ?? null,
    promoted: true,
  }
}
