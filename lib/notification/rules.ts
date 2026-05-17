import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { load_presence_by_user_uuid } from '@/lib/presence/action'
import { decide_external_notification_skip } from '@/lib/presence/rules'

export type notification_kind_key = 'chat' | 'reservation' | 'announcement'

export type notification_primary_channel = 'push' | 'line' | 'none'

export type notification_preferences = {
  primary_channel: notification_primary_channel
  pwa_push_enabled: boolean
  line_enabled: boolean
  kinds: Record<notification_kind_key, boolean>
}

export const default_notification_preferences: notification_preferences = {
  primary_channel: 'line',
  pwa_push_enabled: false,
  line_enabled: true,
  kinds: {
    chat: true,
    reservation: true,
    announcement: true,
  },
}

export function boolean_value(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function parse_primary_channel(
  value: unknown,
): notification_primary_channel | null {
  if (value === 'push' || value === 'line' || value === 'none') {
    return value
  }

  return null
}

export function notification_preferences_to_json(
  preferences: notification_preferences,
): Record<string, unknown> {
  return {
    primary_channel: preferences.primary_channel,
    pwa_push_enabled: preferences.pwa_push_enabled,
    line_enabled: preferences.line_enabled,
    kinds: {
      chat: preferences.kinds.chat,
      reservation: preferences.kinds.reservation,
      announcement: preferences.kinds.announcement,
    },
  }
}

export function normalize_notification_preferences(
  value: unknown,
): notification_preferences {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {}
  const kinds_obj =
    source.kinds && typeof source.kinds === 'object'
      ? (source.kinds as Record<string, unknown>)
      : {}

  const kinds: Record<notification_kind_key, boolean> = {
    chat: boolean_value(
      source.new_chat ?? kinds_obj.chat,
      default_notification_preferences.kinds.chat,
    ),
    reservation: boolean_value(
      source.reservation ?? kinds_obj.reservation,
      default_notification_preferences.kinds.reservation,
    ),
    announcement: boolean_value(
      source.announcement ?? kinds_obj.announcement,
      default_notification_preferences.kinds.announcement,
    ),
  }

  let pwa = boolean_value(
    source.push_enabled ?? source.pwa_push_enabled,
    default_notification_preferences.pwa_push_enabled,
  )
  let line = boolean_value(
    source.line_enabled,
    default_notification_preferences.line_enabled,
  )
  const declared = parse_primary_channel(source.primary_channel)

  if (pwa && line) {
    return {
      primary_channel: 'push',
      pwa_push_enabled: true,
      line_enabled: true,
      kinds,
    }
  }

  if (Object.prototype.hasOwnProperty.call(source, 'primary_channel')) {
    if (declared === 'push' && pwa) {
      return {
        primary_channel: 'push',
        pwa_push_enabled: true,
        line_enabled: false,
        kinds,
      }
    }

    if (declared === 'line' && line) {
      return {
        primary_channel: 'line',
        pwa_push_enabled: false,
        line_enabled: true,
        kinds,
      }
    }

    if (pwa) {
      return {
        primary_channel: 'push',
        pwa_push_enabled: true,
        line_enabled: false,
        kinds,
      }
    }

    if (line) {
      return {
        primary_channel: 'line',
        pwa_push_enabled: false,
        line_enabled: true,
        kinds,
      }
    }

    return {
      primary_channel: 'none',
      pwa_push_enabled: false,
      line_enabled: false,
      kinds,
    }
  }

  if (pwa) {
    return {
      primary_channel: 'push',
      pwa_push_enabled: true,
      line_enabled: false,
      kinds,
    }
  }

  if (line) {
    return {
      primary_channel: 'line',
      pwa_push_enabled: false,
      line_enabled: true,
      kinds,
    }
  }

  return {
    primary_channel: 'none',
    pwa_push_enabled: false,
    line_enabled: false,
    kinds,
  }
}

export async function load_notification_preferences_for_user(
  user_uuid: string | null,
): Promise<notification_preferences | null> {
  const uuid = clean_uuid(user_uuid)

  if (!uuid) {
    return null
  }

  const result = await supabase
    .from('settings')
    .select('notification_preferences')
    .eq('user_uuid', uuid)
    .maybeSingle()

  if (result.error || !result.data) {
    return null
  }

  const row = result.data as { notification_preferences?: unknown }

  return normalize_notification_preferences(
    row.notification_preferences ?? null,
  )
}

export async function resolve_chat_external_notification_route(input: {
  user_uuid: string | null
  participant_uuid?: string | null
  source_channel?: string | null
}): Promise<'push' | 'line' | null> {
  const decision = await resolve_chat_external_notification_decision(input)

  return decision.selected_route
}

export async function resolve_chat_external_notification_decision(input: {
  user_uuid: string | null
  participant_uuid?: string | null
  source_channel?: string | null
}): Promise<{
  primary_channel: notification_primary_channel
  push_enabled: boolean
  line_enabled: boolean
  is_standalone: boolean
  push_subscription_exists: boolean
  line_identity_exists: boolean
  selected_route: 'push' | 'line' | null
  skipped_reason: string | null
}> {
  const user_uuid = clean_uuid(input.user_uuid)
  const participant_uuid = clean_uuid(input.participant_uuid ?? null)
  const source_channel =
    typeof input.source_channel === 'string' ? input.source_channel : null
  const prefs = await load_notification_preferences_for_user(input.user_uuid)

  if (!prefs || !prefs.kinds.chat) {
    return {
      primary_channel: prefs?.primary_channel ?? 'none',
      push_enabled: prefs?.pwa_push_enabled ?? false,
      line_enabled: prefs?.line_enabled ?? false,
      is_standalone: false,
      push_subscription_exists: false,
      line_identity_exists: false,
      selected_route: null,
      skipped_reason: prefs ? 'chat_notifications_disabled' : 'settings_missing',
    }
  }

  const [presence_row, push_subscription_exists, line_identity_exists] =
    await Promise.all([
      load_presence_by_user_uuid(user_uuid),
      resolve_active_pwa_push_subscription_exists(user_uuid),
      resolve_line_identity_exists(user_uuid),
    ])
  const presence_decision = decide_external_notification_skip({
    presence: presence_row,
  })
  const foreground_open = presence_decision.skip_external
  const is_standalone = push_subscription_exists

  if (foreground_open) {
    return {
      primary_channel: prefs.primary_channel,
      push_enabled: prefs.pwa_push_enabled,
      line_enabled: prefs.line_enabled,
      is_standalone,
      push_subscription_exists,
      line_identity_exists,
      selected_route: null,
      skipped_reason:
        presence_decision.external_notification_skipped_reason ??
        'receiver_active_in_app',
    }
  }

  if (prefs.primary_channel === 'push') {
    if (!prefs.pwa_push_enabled) {
      return {
        primary_channel: 'push',
        push_enabled: false,
        line_enabled: false,
        is_standalone,
        push_subscription_exists,
        line_identity_exists,
        selected_route: null,
        skipped_reason: 'push_disabled',
      }
    }

    if (!push_subscription_exists) {
      return {
        primary_channel: 'push',
        push_enabled: true,
        line_enabled: false,
        is_standalone,
        push_subscription_exists,
        line_identity_exists,
        selected_route: null,
        skipped_reason:
          source_channel === 'line' || source_channel === 'liff'
            ? 'pwa_push_not_available_in_line_browser'
            : 'push_subscription_missing',
      }
    }

    return {
      primary_channel: 'push',
      push_enabled: true,
      line_enabled: false,
      is_standalone,
      push_subscription_exists,
      line_identity_exists,
      selected_route: 'push',
      skipped_reason: null,
    }
  }

  if (prefs.primary_channel === 'line') {
    if (!prefs.line_enabled) {
      return {
        primary_channel: 'line',
        push_enabled: false,
        line_enabled: false,
        is_standalone,
        push_subscription_exists,
        line_identity_exists,
        selected_route: null,
        skipped_reason: 'line_disabled',
      }
    }

    if (!line_identity_exists) {
      return {
        primary_channel: 'line',
        push_enabled: false,
        line_enabled: true,
        is_standalone,
        push_subscription_exists,
        line_identity_exists,
        selected_route: null,
        skipped_reason: 'line_identity_missing',
      }
    }

    return {
      primary_channel: 'line',
      push_enabled: false,
      line_enabled: true,
      is_standalone,
      push_subscription_exists,
      line_identity_exists,
      selected_route: 'line',
      skipped_reason: null,
    }
  }

  return {
    primary_channel: 'none',
    push_enabled: false,
    line_enabled: false,
    is_standalone,
    push_subscription_exists,
    line_identity_exists,
    selected_route: null,
    skipped_reason: 'primary_channel_none',
  }
}

async function resolve_active_pwa_push_subscription_exists(
  user_uuid: string | null,
): Promise<boolean> {
  if (!user_uuid) {
    return false
  }

  const result = await supabase
    .from('push_subscriptions')
    .select('subscription_uuid')
    .eq('user_uuid', user_uuid)
    .eq('enabled', true)
    .eq('is_pwa', true)
    .not('endpoint', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)

  return !result.error && (result.data?.length ?? 0) > 0
}

async function resolve_line_identity_exists(
  user_uuid: string | null,
): Promise<boolean> {
  if (!user_uuid) {
    return false
  }

  const result = await supabase
    .from('identities')
    .select('identity_uuid')
    .eq('user_uuid', user_uuid)
    .eq('provider', 'line')
    .limit(1)

  return !result.error && (result.data?.length ?? 0) > 0
}

export async function user_allows_notification(input: {
  user_uuid: string | null
  channel: 'push' | 'line'
  kind: notification_kind_key
}) {
  const prefs = await load_notification_preferences_for_user(input.user_uuid)

  if (!prefs) {
    return false
  }

  if (!prefs.kinds[input.kind]) {
    return false
  }

  if (input.channel === 'push') {
    return prefs.primary_channel === 'push'
  }

  return prefs.primary_channel === 'line'
}
