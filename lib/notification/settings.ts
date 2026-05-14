import 'server-only'

import { get_session_user } from '@/lib/auth/route'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import {
  boolean_value,
  default_notification_preferences,
  normalize_notification_preferences,
  type notification_preferences,
} from './rules'

function merge_profile_json(
  profile_json: unknown,
  preferences: notification_preferences,
) {
  const base =
    profile_json && typeof profile_json === 'object' && !Array.isArray(profile_json)
      ? (profile_json as Record<string, unknown>)
      : {}

  return {
    ...base,
    notification_preferences: preferences,
  }
}

export async function load_notification_settings() {
  const session = await get_session_user()
  const user_uuid = clean_uuid(session.user_uuid)

  if (!user_uuid) {
    return {
      ok: false as const,
      error: 'session_required',
      preferences: default_notification_preferences,
    }
  }

  const result = await supabase
    .from('users')
    .select('profile_json')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (result.error) {
    return {
      ok: false as const,
      error: result.error.message,
      preferences: default_notification_preferences,
    }
  }

  const row = result.data as { profile_json?: unknown } | null
  const profile_json = row?.profile_json
  const source =
    profile_json && typeof profile_json === 'object'
      ? (profile_json as Record<string, unknown>).notification_preferences
      : null

  return {
    ok: true as const,
    preferences: normalize_notification_preferences(source),
  }
}

export async function save_notification_settings(input: {
  preferences: Partial<notification_preferences> | null | undefined
}) {
  const session = await get_session_user()
  const user_uuid = clean_uuid(session.user_uuid)

  if (!user_uuid) {
    return {
      ok: false as const,
      error: 'session_required',
      preferences: default_notification_preferences,
    }
  }

  const current = await supabase
    .from('users')
    .select('profile_json')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (current.error) {
    return {
      ok: false as const,
      error: current.error.message,
      preferences: default_notification_preferences,
    }
  }

  const current_row = current.data as { profile_json?: unknown } | null
  const profile_json = current_row?.profile_json
  const source =
    profile_json && typeof profile_json === 'object'
      ? (profile_json as Record<string, unknown>).notification_preferences
      : null
  const previous = normalize_notification_preferences(source)
  const incoming = input.preferences ?? {}
  const incoming_kinds =
    incoming.kinds && typeof incoming.kinds === 'object'
      ? (incoming.kinds as Record<string, unknown>)
      : {}
  const preferences: notification_preferences = {
    pwa_push_enabled: boolean_value(
      incoming.pwa_push_enabled,
      previous.pwa_push_enabled,
    ),
    line_enabled: boolean_value(incoming.line_enabled, previous.line_enabled),
    kinds: {
      chat: boolean_value(incoming_kinds.chat, previous.kinds.chat),
      reservation: boolean_value(
        incoming_kinds.reservation,
        previous.kinds.reservation,
      ),
      announcement: boolean_value(
        incoming_kinds.announcement,
        previous.kinds.announcement,
      ),
    },
  }

  const update = await supabase
    .from('users')
    .update({
      profile_json: merge_profile_json(profile_json, preferences),
    })
    .eq('user_uuid', user_uuid)

  if (update.error) {
    return {
      ok: false as const,
      error: update.error.message,
      preferences,
    }
  }

  return {
    ok: true as const,
    preferences,
  }
}
