import 'server-only'

import { get_session_user } from '@/lib/auth/route'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'

type push_subscription_json = {
  endpoint?: unknown
  keys?: {
    p256dh?: unknown
    auth?: unknown
  }
}

export type save_push_subscription_result =
  | { ok: true }
  | { ok: false; error: string }

function string_value(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

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

export async function save_push_subscription(input: {
  room_uuid: unknown
  participant_uuid: unknown
  subscription: push_subscription_json | null | undefined
  user_agent: unknown
}): Promise<save_push_subscription_result> {
  const session = await get_session_user()
  const user_uuid = clean_uuid(session.user_uuid)
  const room_uuid = clean_uuid(string_value(input.room_uuid))
  const participant_uuid = clean_uuid(string_value(input.participant_uuid))

  const base = {
    user_uuid,
    participant_uuid,
    role: session.role,
    tier: session.tier,
    source_channel: 'pwa',
    room_uuid,
    app_visibility_state: null,
    phase: 'save_push_subscription',
  }

  await debug_push_subscription('push_subscription_save_started', base)

  if (
    !user_uuid ||
    session.role !== 'user' ||
    (session.tier !== 'member' && session.tier !== 'vip')
  ) {
    await debug_push_subscription('push_subscription_save_failed', {
      ...base,
      error_code: 'pwa_subscription_not_allowed',
      error_message: 'Only member or vip users can save PWA subscriptions',
    })

    return { ok: false, error: 'not_allowed' }
  }

  const endpoint = string_value(input.subscription?.endpoint)
  const p256dh = string_value(input.subscription?.keys?.p256dh)
  const auth = string_value(input.subscription?.keys?.auth)

  if (!endpoint || !p256dh || !auth) {
    await debug_push_subscription('push_subscription_save_failed', {
      ...base,
      error_code: 'invalid_subscription_payload',
      error_message: 'Push subscription is missing endpoint or keys',
    })

    return { ok: false, error: 'invalid_subscription' }
  }

  const resolved_participant_uuid = await resolve_participant_uuid({
    participant_uuid,
    room_uuid,
    user_uuid,
  })

  const result = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_uuid,
        participant_uuid: resolved_participant_uuid,
        endpoint,
        p256dh,
        auth,
        user_agent: string_value(input.user_agent),
        source_channel: 'pwa',
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

  if (result.error) {
    await debug_push_subscription('push_subscription_save_failed', {
      ...base,
      participant_uuid: resolved_participant_uuid ?? participant_uuid,
      error_code: result.error.code,
      error_message: result.error.message,
      error_details: error_field(result.error, 'details'),
      error_hint: error_field(result.error, 'hint'),
    })

    return { ok: false, error: 'save_failed' }
  }

  await debug_push_subscription('push_subscription_save_succeeded', {
    ...base,
    participant_uuid: resolved_participant_uuid ?? participant_uuid,
    has_push_subscription: true,
  })

  return { ok: true }
}
