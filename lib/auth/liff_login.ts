import 'server-only'

import { resolve_auth_access } from '@/lib/auth/access'
import { supabase } from '@/lib/db/supabase'
import {
  ensure_session,
  promote_browser_visitor_to_user,
  type browser_session_result,
} from '@/lib/auth/session'
import { resolve_dispatch_locale } from '@/lib/dispatch/context'

/**
 * LIFF profile -> user/identity/visitor. No OAuth code exchange, no id_token, no LINE_LOGIN_*.
 */

export type resolve_liff_login_input = {
  request: Request
  line_user_id: string
  display_name: string | null
  image_url: string | null
  browser_locale: string | null
  visitor_uuid: string | null
}

export type resolve_liff_login_result = {
  access: Awaited<ReturnType<typeof resolve_auth_access>>
  resolved_session_visitor_uuid: string
  resolved_visitor_uuid: string
  promoted: Awaited<ReturnType<typeof promote_browser_visitor_to_user>>
  resolved_locale: Awaited<ReturnType<typeof resolve_dispatch_locale>>
  identity_uuid: string | null
}

function get_client_ip(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()

    if (first) {
      return first
    }
  }

  return headers.get('x-real-ip')
}

function get_access_platform(user_agent: string | null) {
  const normalized_user_agent = user_agent?.toLowerCase() ?? ''

  if (
    normalized_user_agent.includes('iphone') ||
    normalized_user_agent.includes('ipad') ||
    normalized_user_agent.includes('ipod')
  ) {
    return 'ios'
  }

  if (normalized_user_agent.includes('android')) {
    return 'android'
  }

  if (normalized_user_agent.includes('mac os')) {
    return 'mac'
  }

  if (normalized_user_agent.includes('windows')) {
    return 'windows'
  }

  return 'unknown'
}

async function ensure_liff_visitor_session(input: {
  request: Request
  visitor_uuid: string | null
  locale: string | null
}): Promise<browser_session_result> {
  const headers = input.request.headers

  return ensure_session({
    visitor_uuid: input.visitor_uuid,
    caller: 'api_session',
    source_channel: 'liff',
    locale: input.locale,
    user_agent: headers.get('user-agent'),
    access_platform: get_access_platform(headers.get('user-agent')),
    ip: get_client_ip(headers),
  })
}

async function update_liff_visitor_row(input: {
  visitor_uuid: string
  user_uuid: string
}) {
  const updated_at = new Date().toISOString()
  const updated = await supabase
    .from('visitors')
    .update({
      user_uuid: input.user_uuid,
      access_channel: 'liff',
      last_seen_at: updated_at,
      updated_at,
    })
    .eq('visitor_uuid', input.visitor_uuid)
    .select('visitor_uuid, user_uuid')
    .maybeSingle()

  if (updated.error) {
    throw updated.error
  }

  if (!updated.data?.visitor_uuid) {
    throw new Error('LIFF visitor row was not ensured by session core')
  }
}

async function update_liff_user_profile_fields(input: {
  user_uuid: string
  display_name?: string | null
  image_url?: string | null
}) {
  if (!input.display_name && !input.image_url) {
    return
  }

  const updated = await supabase
    .from('users')
    .update({
      display_name: input.display_name ?? null,
      image_url: input.image_url ?? null,
    })
    .eq('user_uuid', input.user_uuid)

  if (updated.error) {
    throw updated.error
  }
}

function pick_identity_uuid(row: Record<string, unknown> | null): string | null {
  if (!row) {
    return null
  }

  if (typeof row.identity_uuid === 'string') {
    return row.identity_uuid
  }

  if (typeof row.id === 'string') {
    return row.id
  }

  return null
}

async function fetch_line_identity_uuid(input: {
  user_uuid: string
  line_user_id: string
}): Promise<string | null> {
  const result = await supabase
    .from('identities')
    .select('*')
    .eq('user_uuid', input.user_uuid)
    .eq('provider', 'line')
    .eq('provider_id', input.line_user_id)
    .maybeSingle()

  if (result.error || !result.data) {
    return null
  }

  return pick_identity_uuid(result.data as Record<string, unknown>)
}

export async function resolve_liff_login(
  input: resolve_liff_login_input,
): Promise<resolve_liff_login_result> {
  const initial_locale = await resolve_dispatch_locale({
    source_channel: 'liff',
    browser_selected_locale: input.browser_locale,
    debug: false,
  })

  const session = await ensure_liff_visitor_session({
    request: input.request,
    visitor_uuid: input.visitor_uuid,
    locale: initial_locale.locale,
  })

  const resolved_session_visitor_uuid = session.visitor_uuid

  const access = await resolve_auth_access({
    provider: 'line',
    provider_id: input.line_user_id,
    visitor_uuid: resolved_session_visitor_uuid,
    display_name: input.display_name,
    image_url: input.image_url,
    locale: initial_locale.locale,
  })

  await update_liff_user_profile_fields({
    user_uuid: access.user_uuid,
    display_name: input.display_name,
    image_url: input.image_url,
  })

  const resolved_locale = await resolve_dispatch_locale({
    source_channel: 'liff',
    stored_user_locale: access.locale,
    browser_selected_locale: input.browser_locale,
    debug: false,
  })

  const promoted = await promote_browser_visitor_to_user({
    old_visitor_uuid: resolved_session_visitor_uuid,
    user_uuid: access.user_uuid,
  })

  const resolved_visitor_uuid =
    promoted.visitor_uuid || access.visitor_uuid

  await update_liff_visitor_row({
    visitor_uuid: resolved_visitor_uuid,
    user_uuid: access.user_uuid,
  })

  const identity_uuid = await fetch_line_identity_uuid({
    user_uuid: access.user_uuid,
    line_user_id: input.line_user_id,
  })

  return {
    access,
    resolved_session_visitor_uuid,
    resolved_visitor_uuid,
    promoted,
    resolved_locale,
    identity_uuid,
  }
}
