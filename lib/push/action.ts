import 'server-only'

import { get_session_user } from '@/lib/auth/route'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'

import {
  normalize_push_subscription_input,
  type push_subscription_request_body,
} from './context'
import {
  can_save_push_subscription,
  resolve_push_status,
  type push_subscription_row,
} from './rules'

export type save_push_subscription_result =
  | { ok: true }
  | { ok: false; error: string }

export type deactivate_push_subscription_result =
  | { ok: true }
  | { ok: false; error: string }

function error_field(error: unknown, key: string): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const value = (error as Record<string, unknown>)[key]

  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function debug_push_subscription(
  event:
    | 'push_subscription_save_started'
    | 'push_subscription_save_succeeded'
    | 'push_subscription_save_failed',
  payload: Record<string, unknown>,
) {
  await debug_event({
    category: 'pwa',
    event,
    payload,
  })
}

async function resolve_participant_uuid(input: {
  participant_uuid: string | null
  room_uuid: string | null
  user_uuid: string
}) {
  if (input.participant_uuid) {
    const result = await supabase
      .from('participants')
      .select('participant_uuid, room_uuid, user_uuid, role')
      .eq('participant_uuid', input.participant_uuid)
      .eq('user_uuid', input.user_uuid)
      .maybeSingle()

    if (!result.error && result.data?.participant_uuid) {
      return result.data.participant_uuid as string
    }
  }

  if (!input.room_uuid) {
    return null
  }

  const result = await supabase
    .from('participants')
    .select('participant_uuid')
    .eq('room_uuid', input.room_uuid)
    .eq('user_uuid', input.user_uuid)
    .eq('role', 'user')
    .maybeSingle()

  if (result.error || !result.data?.participant_uuid) {
    return null
  }

  return result.data.participant_uuid as string
}

export async function load_user_pwa_installed(
  user_uuid: string,
): Promise<boolean> {
  const result = await supabase
    .from('push_subscriptions')
    .select('is_active, is_pwa')
    .eq('user_uuid', user_uuid)
    .eq('is_active', true)

  if (result.error) {
    return false
  }

  const rows = (result.data ?? []) as push_subscription_row[]

  return resolve_push_status(rows).pwa_installed
}

export async function list_active_push_subscriptions(user_uuid: string) {
  const result = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_uuid', user_uuid)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (result.error) {
    throw result.error
  }

  return result.data ?? []
}

export async function deactivate_push_subscription(input: {
  endpoint: string | null | undefined
}): Promise<deactivate_push_subscription_result> {
  const session = await get_session_user()
  const user_uuid = clean_uuid(session.user_uuid)
  const endpoint =
    typeof input.endpoint === 'string' ? input.endpoint.trim() : ''

  if (!user_uuid || !can_save_push_subscription(session)) {
    return { ok: false, error: 'not_allowed' }
  }

  if (!endpoint) {
    return { ok: false, error: 'invalid_endpoint' }
  }

  const result = await supabase
    .from('push_subscriptions')
    .update({
      is_active: false,
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_uuid', user_uuid)
    .eq('endpoint', endpoint)

  if (result.error) {
    return { ok: false, error: 'deactivate_failed' }
  }

  return { ok: true }
}

export async function save_push_subscription(
  body: push_subscription_request_body | null | undefined,
): Promise<save_push_subscription_result> {
  const session = await get_session_user()
  const user_uuid = clean_uuid(session.user_uuid)

  const normalized = normalize_push_subscription_input(body)

  const base = {
    user_uuid,
    role: session.role,
    tier: session.tier,
    room_uuid: normalized?.room_uuid ?? null,
    participant_uuid: normalized?.participant_uuid ?? null,
    phase: 'save_push_subscription',
  }

  await debug_push_subscription('push_subscription_save_started', base)

  if (!user_uuid || !can_save_push_subscription(session)) {
    await debug_push_subscription('push_subscription_save_failed', {
      ...base,
      error_code: 'push_subscription_not_allowed',
      error_message: 'Only member or vip users can save push subscriptions',
    })

    return { ok: false, error: 'not_allowed' }
  }

  if (!normalized) {
    await debug_push_subscription('push_subscription_save_failed', {
      ...base,
      error_code: 'invalid_subscription_payload',
      error_message: 'Push subscription is missing endpoint or keys',
    })

    return { ok: false, error: 'invalid_subscription' }
  }

  const resolved_participant_uuid = await resolve_participant_uuid({
    participant_uuid: normalized.participant_uuid,
    room_uuid: normalized.room_uuid,
    user_uuid,
  })

  const now = new Date().toISOString()

  const existing = await supabase
    .from('push_subscriptions')
    .select('subscription_uuid, created_at, user_uuid')
    .eq('endpoint', normalized.endpoint)
    .maybeSingle()

  if (existing.error) {
    await debug_push_subscription('push_subscription_save_failed', {
      ...base,
      participant_uuid: resolved_participant_uuid ?? normalized.participant_uuid,
      error_code: existing.error.code,
      error_message: existing.error.message,
      error_details: error_field(existing.error, 'details'),
      error_hint: error_field(existing.error, 'hint'),
    })

    return { ok: false, error: 'save_failed' }
  }

  const update_row = {
    user_uuid,
    participant_uuid: resolved_participant_uuid ?? null,
    p256dh: normalized.p256dh,
    auth: normalized.auth,
    device_type: normalized.device_type,
    browser: normalized.browser,
    os: normalized.os,
    is_pwa: normalized.is_pwa,
    is_active: true,
    enabled: true,
    last_seen_at: now,
    updated_at: now,
  }

  let result

  if (existing.data?.subscription_uuid != null) {
    const row = existing.data as { user_uuid?: string | null }

    if (row.user_uuid && row.user_uuid !== user_uuid) {
      await debug_push_subscription('push_subscription_save_failed', {
        ...base,
        participant_uuid:
          resolved_participant_uuid ?? normalized.participant_uuid,
        error_code: 'endpoint_owned_by_other_user',
        error_message:
          'Push endpoint is already registered to a different user',
      })

      return { ok: false, error: 'endpoint_conflict' }
    }

    result = await supabase
      .from('push_subscriptions')
      .update(update_row)
      .eq('endpoint', normalized.endpoint)
      .eq('user_uuid', user_uuid)
  } else {
    result = await supabase.from('push_subscriptions').insert({
      ...update_row,
      endpoint: normalized.endpoint,
      created_at: now,
    })
  }

  if (result.error) {
    await debug_push_subscription('push_subscription_save_failed', {
      ...base,
      participant_uuid: resolved_participant_uuid ?? normalized.participant_uuid,
      error_code: result.error.code,
      error_message: result.error.message,
      error_details: error_field(result.error, 'details'),
      error_hint: error_field(result.error, 'hint'),
    })

    return { ok: false, error: 'save_failed' }
  }

  await debug_push_subscription('push_subscription_save_succeeded', {
    ...base,
    participant_uuid: resolved_participant_uuid ?? normalized.participant_uuid,
    has_push_subscription: true,
    is_pwa: normalized.is_pwa,
  })

  return { ok: true }
}
