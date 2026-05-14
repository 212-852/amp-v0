import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

export type notification_kind_key = 'chat' | 'reservation' | 'announcement'

export type notification_preferences = {
  pwa_push_enabled: boolean
  line_enabled: boolean
  kinds: Record<notification_kind_key, boolean>
}

export const default_notification_preferences: notification_preferences = {
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

export function normalize_notification_preferences(
  value: unknown,
): notification_preferences {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {}
  const kinds =
    source.kinds && typeof source.kinds === 'object'
      ? (source.kinds as Record<string, unknown>)
      : {}

  return {
    pwa_push_enabled: boolean_value(
      source.push_enabled ?? source.pwa_push_enabled,
      default_notification_preferences.pwa_push_enabled,
    ),
    line_enabled: boolean_value(
      source.line_enabled,
      default_notification_preferences.line_enabled,
    ),
    kinds: {
      chat: boolean_value(
        source.new_chat ?? kinds.chat,
        default_notification_preferences.kinds.chat,
      ),
      reservation: boolean_value(
        source.reservation ?? kinds.reservation,
        default_notification_preferences.kinds.reservation,
      ),
      announcement: boolean_value(
        source.announcement ?? kinds.announcement,
        default_notification_preferences.kinds.announcement,
      ),
    },
  }
}

export async function user_allows_notification(input: {
  user_uuid: string | null
  channel: 'push' | 'line'
  kind: notification_kind_key
}) {
  const user_uuid = clean_uuid(input.user_uuid)

  if (!user_uuid) {
    return false
  }

  const result = await supabase
    .from('settings')
    .select('notification_preferences')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (result.error) {
    return false
  }

  const row = result.data as { notification_preferences?: unknown } | null
  const preferences = normalize_notification_preferences(
    row?.notification_preferences ?? null,
  )

  if (!preferences.kinds[input.kind]) {
    return false
  }

  if (input.channel === 'push') {
    return preferences.pwa_push_enabled
  }

  return preferences.line_enabled
}
