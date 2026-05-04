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

export type browser_session_cookie_values = {
  visitor_uuid: string
  session_uuid: string
  cookie_exists: boolean
  session_exists: boolean
}

export type browser_session_caller =
  | 'page'
  | 'api_session'
  | 'line_webhook'
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

export type identity_promotion_result = {
  visitor_uuid: string
  user_uuid: string
  existing_room_uuid: string | null
  participant_uuid: string | null
  promoted: boolean
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

async function emit_session_debug(input: {
  event: 'session_created' | 'session_reused'
  caller: browser_session_caller
  visitor_uuid: string
  cookie_exists: boolean
  session_exists: boolean
  created: boolean
}) {
  const [{ control }, { debug_event }] = await Promise.all([
    import('@/lib/config/control'),
    import('@/lib/debug'),
  ])

  if (!control.debug.visitor_context) {
    return
  }

  await debug_event({
    category: 'session',
    event: input.event,
    payload: {
      caller: input.caller,
      visitor_uuid: input.visitor_uuid,
      cookie_exists: input.cookie_exists,
      session_exists: input.session_exists,
      created: input.created,
    },
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

async function find_guest_participant_by_visitor(
  supabase: Awaited<ReturnType<typeof get_supabase>>,
  visitor_uuid: string,
) {
  const result = await supabase
    .from('participants')
    .select('participant_uuid, room_uuid')
    .eq('role', 'user')
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
}) {
  const existing_visitor = await find_visitor_row(
    input.supabase,
    input.visitor_uuid,
  )

  if (existing_visitor.error) {
    throw existing_visitor.error
  }

  if (existing_visitor.data?.visitor_uuid) {
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

  const created_visitor = await input.supabase
    .from('visitors')
    .insert({
      visitor_uuid: input.visitor_uuid,
      user_uuid: null,
    })
    .select('visitor_uuid')
    .single()

  if (!created_visitor.error) {
    return true
  }

  if (!is_unique_violation(created_visitor.error)) {
    throw created_visitor.error
  }

  const after_conflict = await find_visitor_row(
    input.supabase,
    input.visitor_uuid,
  )

  if (after_conflict.error) {
    throw after_conflict.error
  }

  if (!after_conflict.data?.visitor_uuid) {
    throw created_visitor.error
  }

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
    access_channel: 'web',
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

export function resolve_browser_session_cookie_values(
  visitor_cookie: string | null | undefined,
  session_cookie: string | null | undefined,
): browser_session_cookie_values {
  const existing = read_browser_session_cookie_values(
    visitor_cookie,
    session_cookie,
  )

  return {
    visitor_uuid: existing.visitor_uuid ?? mint_visitor_uuid(),
    session_uuid: existing.session_uuid ?? mint_session_uuid(),
    cookie_exists: Boolean(existing.visitor_uuid),
    session_exists: Boolean(existing.session_uuid),
  }
}

export async function resolve_browser_session(
  input: browser_session_input,
): Promise<browser_session_result> {
  const visitor_uuid = input.visitor_uuid ?? mint_visitor_uuid()
  const session_uuid = input.session_uuid ?? mint_session_uuid()
  const cookie_exists = Boolean(input.visitor_uuid)
  const session_exists = Boolean(input.session_uuid)
  const supabase = await get_supabase()
  const is_new_visitor = await ensure_browser_visitor({
    supabase,
    visitor_uuid,
  })
  const is_new_session = await ensure_browser_session({
    supabase,
    visitor_uuid,
    session_uuid,
    locale: input.locale,
    user_agent: input.user_agent,
    access_platform: input.access_platform,
  })
  const created = is_new_visitor || is_new_session

  await emit_session_debug({
    event: created ? 'session_created' : 'session_reused',
    caller: input.caller ?? 'unknown',
    visitor_uuid,
    cookie_exists,
    session_exists,
    created,
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
