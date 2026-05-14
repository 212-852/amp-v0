import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

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
    if (declared === 'push') {
      line = false
    } else if (declared === 'line') {
      pwa = false
    } else if (declared === 'none') {
      pwa = false
      line = false
    } else {
      line = false
    }
  }

  let primary_channel: notification_primary_channel
  if (pwa) {
    primary_channel = 'push'
    line = false
  } else if (line) {
    primary_channel = 'line'
    pwa = false
  } else {
    primary_channel = 'none'
    pwa = false
    line = false
  }

  return {
    primary_channel,
    pwa_push_enabled: pwa,
    line_enabled: line,
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
}): Promise<notification_primary_channel> {
  const prefs = await load_notification_preferences_for_user(input.user_uuid)

  if (!prefs || !prefs.kinds.chat) {
    return 'none'
  }

  return prefs.primary_channel
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
