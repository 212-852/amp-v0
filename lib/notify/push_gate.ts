import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'
import {
  default_notification_preferences,
  normalize_notification_preferences,
  notification_preferences_to_json,
  type notification_kind_key,
  type notification_preferences,
} from '@/lib/notification/rules'

export type push_chat_gate_result = {
  allowed: boolean
  pwa_push_enabled: boolean
  chat_enabled: boolean
  push_subscription_enabled: boolean
  disabled_reason: string | null
}

function kind_enabled(
  normalized: notification_preferences,
  kind: notification_kind_key,
): boolean {
  return normalized.kinds[kind] === true
}

async function emit_notify_push_debug(
  event:
    | 'notify_push_preference_checked'
    | 'notify_push_subscription_checked'
    | 'notify_push_disabled_reason',
  payload: {
    user_uuid: string | null
    pwa_push_enabled: boolean
    chat_enabled: boolean
    push_subscription_enabled: boolean
    disabled_reason: string | null
  },
) {
  await debug_event({
    category: 'pwa',
    event,
    payload,
  })
}

async function emit_push_subscription_lookup_debug(
  event:
    | 'push_subscription_lookup_started'
    | 'push_subscription_lookup_result'
    | 'push_subscription_lookup_failed',
  payload: {
    user_uuid: string | null
    participant_uuid: string | null
    source_channel: string | null
    enabled: boolean | null
    endpoint_exists: boolean | null
    subscription_count: number | null
    latest_updated_at: string | null
    error_code?: string | null
    error_message?: string | null
  },
) {
  await debug_event({
    category: 'pwa',
    event,
    payload,
  })
}

function build_disabled_reason(input: {
  push_subscription_enabled: boolean
  pwa_push_enabled: boolean
  kind_enabled: boolean
  kind: notification_kind_key
}): string {
  const parts: string[] = []

  if (!input.push_subscription_enabled) {
    parts.push('push_subscription_inactive')
  }

  if (!input.pwa_push_enabled) {
    parts.push('pwa_push_disabled')
  }

  if (!input.kind_enabled) {
    if (input.kind === 'chat') {
      parts.push('chat_notifications_disabled')
    } else {
      parts.push(`${input.kind}_notifications_disabled`)
    }
  }

  return parts.join(',')
}

/**
 * Push delivery gate for user-targeted notifications.
 * Reads public.settings.notification_preferences and push_subscriptions.is_active
 * (exposed as push_subscription_enabled in payloads).
 */
export async function evaluate_push_chat_delivery_allowed(input: {
  user_uuid: string
  participant_uuid?: string | null
  source_channel?: string | null
  kind?: notification_kind_key
}): Promise<push_chat_gate_result> {
  const kind = input.kind ?? 'chat'
  const user_uuid = clean_uuid(input.user_uuid)
  const participant_uuid = clean_uuid(input.participant_uuid ?? null)
  const source_channel = input.source_channel ?? null
  const empty_payload = {
    user_uuid,
    pwa_push_enabled: false,
    chat_enabled: false,
    push_subscription_enabled: false,
    disabled_reason: 'invalid_user_uuid' as string | null,
  }

  if (!user_uuid) {
    await emit_push_subscription_lookup_debug(
      'push_subscription_lookup_failed',
      {
        user_uuid,
        participant_uuid,
        source_channel,
        enabled: null,
        endpoint_exists: null,
        subscription_count: null,
        latest_updated_at: null,
        error_code: 'invalid_user_uuid',
        error_message: 'user_uuid_missing',
      },
    )

    await emit_notify_push_debug('notify_push_preference_checked', {
      user_uuid,
      pwa_push_enabled: false,
      chat_enabled: false,
      push_subscription_enabled: false,
      disabled_reason: null,
    })

    await emit_notify_push_debug('notify_push_subscription_checked', {
      user_uuid,
      pwa_push_enabled: false,
      chat_enabled: false,
      push_subscription_enabled: false,
      disabled_reason: null,
    })

    await emit_notify_push_debug('notify_push_disabled_reason', empty_payload)

    return {
      allowed: false,
      pwa_push_enabled: false,
      chat_enabled: false,
      push_subscription_enabled: false,
      disabled_reason: 'invalid_user_uuid',
    }
  }

  await emit_push_subscription_lookup_debug('push_subscription_lookup_started', {
    user_uuid,
    participant_uuid,
    source_channel,
    enabled: true,
    endpoint_exists: null,
    subscription_count: null,
    latest_updated_at: null,
  })

  const [sub_result, settings_result] = await Promise.all([
    supabase
      .from('push_subscriptions')
      .select('subscription_uuid, endpoint, enabled, updated_at')
      .eq('user_uuid', user_uuid)
      .eq('enabled', true)
      .not('endpoint', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1),
    supabase
      .from('settings')
      .select('notification_preferences')
      .eq('user_uuid', user_uuid)
      .maybeSingle(),
  ])

  if (sub_result.error) {
    await emit_push_subscription_lookup_debug(
      'push_subscription_lookup_failed',
      {
        user_uuid,
        participant_uuid,
        source_channel,
        enabled: true,
        endpoint_exists: null,
        subscription_count: null,
        latest_updated_at: null,
        error_code: sub_result.error.code,
        error_message: sub_result.error.message,
      },
    )
  }

  const latest_subscription =
    !sub_result.error && sub_result.data
      ? (sub_result.data[0] as {
          endpoint?: string | null
          enabled?: boolean | null
          updated_at?: string | null
        } | undefined)
      : undefined
  const push_subscription_enabled = Boolean(
    !sub_result.error &&
      latest_subscription?.endpoint &&
      latest_subscription.enabled === true,
  )

  if (!sub_result.error) {
    await emit_push_subscription_lookup_debug('push_subscription_lookup_result', {
      user_uuid,
      participant_uuid,
      source_channel,
      enabled: latest_subscription?.enabled ?? null,
      endpoint_exists: Boolean(latest_subscription?.endpoint),
      subscription_count: sub_result.data?.length ?? 0,
      latest_updated_at: latest_subscription?.updated_at ?? null,
    })
  }

  if (settings_result.error) {
    await emit_notify_push_debug('notify_push_preference_checked', {
      user_uuid,
      pwa_push_enabled: false,
      chat_enabled: false,
      push_subscription_enabled,
      disabled_reason: null,
    })

    await emit_notify_push_debug('notify_push_subscription_checked', {
      user_uuid,
      pwa_push_enabled: false,
      chat_enabled: false,
      push_subscription_enabled,
      disabled_reason: null,
    })

    await emit_notify_push_debug('notify_push_disabled_reason', {
      user_uuid,
      pwa_push_enabled: false,
      chat_enabled: false,
      push_subscription_enabled,
      disabled_reason: settings_result.error.message,
    })

    return {
      allowed: false,
      pwa_push_enabled: false,
      chat_enabled: false,
      push_subscription_enabled,
      disabled_reason: settings_result.error.message,
    }
  }

  const has_settings_row = settings_result.data != null
  let doc: unknown =
    (settings_result.data as { notification_preferences?: unknown } | null)
      ?.notification_preferences ?? null

  if (!has_settings_row && push_subscription_enabled) {
    const seeded: notification_preferences = {
      ...default_notification_preferences,
      pwa_push_enabled: true,
    }
    const seeded_json = notification_preferences_to_json(seeded)

    await supabase.from('settings').upsert(
      {
        user_uuid,
        notification_preferences: seeded_json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_uuid' },
    )

    doc = seeded_json
  }

  const normalized = normalize_notification_preferences(doc)
  const pwa_push_enabled = normalized.pwa_push_enabled === true
  const category_enabled = kind_enabled(normalized, kind)
  const allowed =
    push_subscription_enabled && pwa_push_enabled && category_enabled
  const disabled_reason = allowed
    ? null
    : build_disabled_reason({
        push_subscription_enabled,
        pwa_push_enabled,
        kind_enabled: category_enabled,
        kind,
      })

  await emit_notify_push_debug('notify_push_preference_checked', {
    user_uuid,
    pwa_push_enabled,
    chat_enabled: category_enabled,
    push_subscription_enabled,
    disabled_reason: null,
  })

  await emit_notify_push_debug('notify_push_subscription_checked', {
    user_uuid,
    pwa_push_enabled,
    chat_enabled: category_enabled,
    push_subscription_enabled,
    disabled_reason: null,
  })

  if (!allowed && disabled_reason) {
    await emit_notify_push_debug('notify_push_disabled_reason', {
      user_uuid,
      pwa_push_enabled,
      chat_enabled: category_enabled,
      push_subscription_enabled,
      disabled_reason,
    })
  }

  return {
    allowed,
    pwa_push_enabled,
    chat_enabled: category_enabled,
    push_subscription_enabled,
    disabled_reason,
  }
}
