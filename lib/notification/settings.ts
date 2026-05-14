import 'server-only'

import { get_session_user } from '@/lib/auth/route'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'
import {
  boolean_value,
  default_notification_preferences,
  normalize_notification_preferences,
  type notification_preferences,
} from './rules'

type setting_json = {
  push_enabled: boolean
  line_enabled: boolean
  new_chat: boolean
  reservation: boolean
  announcement: boolean
}

function error_field(error: unknown, key: string): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const value = (error as Record<string, unknown>)[key]

  return typeof value === 'string' ? value : null
}

async function debug_notification_setting(
  event: string,
  payload: Record<string, unknown>,
) {
  await debug_event({
    category: 'pwa',
    event,
    payload,
  })
}

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
    notification_preferences: to_settings_json(preferences),
  }
}

function to_settings_json(preferences: notification_preferences): setting_json {
  return {
    push_enabled: preferences.pwa_push_enabled,
    line_enabled: preferences.line_enabled,
    new_chat: preferences.kinds.chat,
    reservation: preferences.kinds.reservation,
    announcement: preferences.kinds.announcement,
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

  const settings = await supabase
    .from('notification_settings')
    .select('settings')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (!settings.error && settings.data) {
    const row = settings.data as { settings?: unknown } | null

    return {
      ok: true as const,
      preferences: normalize_notification_preferences(row?.settings),
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
  request_body?: unknown
}) {
  const session = await get_session_user()
  const user_uuid = clean_uuid(session.user_uuid)

  await debug_notification_setting('notification_setting_payload', {
    user_uuid,
    request_body: input.request_body ?? null,
    parsed_json: input.preferences ?? null,
    enabled_flags: input.preferences ?? null,
    phase: 'save_notification_settings',
  })

  if (!user_uuid) {
    await debug_notification_setting('notification_setting_validation_failed', {
      user_uuid,
      request_body: input.request_body ?? null,
      parsed_json: input.preferences ?? null,
      enabled_flags: input.preferences ?? null,
      error_code: 'session_required',
      error_message: 'user_uuid_missing',
      phase: 'validate_session',
    })

    return {
      ok: false as const,
      error: 'session_required',
      preferences: default_notification_preferences,
    }
  }

  const current_settings = await supabase
    .from('notification_settings')
    .select('settings')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (current_settings.error) {
    await debug_notification_setting('notification_setting_response', {
      user_uuid,
      request_body: input.request_body ?? null,
      parsed_json: input.preferences ?? null,
      enabled_flags: input.preferences ?? null,
      error_code: current_settings.error.code,
      error_message: current_settings.error.message,
      error_details: error_field(current_settings.error, 'details'),
      error_hint: error_field(current_settings.error, 'hint'),
      phase: 'select_notification_settings',
    })

    return {
      ok: false as const,
      error: current_settings.error.message,
      preferences: default_notification_preferences,
    }
  }

  const current_row = current_settings.data as { settings?: unknown } | null
  const source = current_row?.settings ?? null
  const previous = normalize_notification_preferences(source)
  const incoming = input.preferences ?? {}
  const incoming_kinds =
    incoming.kinds && typeof incoming.kinds === 'object'
      ? (incoming.kinds as Record<string, unknown>)
      : {}
  const preferences: notification_preferences = {
    pwa_push_enabled: boolean_value(
      (incoming as Record<string, unknown>).push_enabled ??
        incoming.pwa_push_enabled,
      previous.pwa_push_enabled,
    ),
    line_enabled: boolean_value(incoming.line_enabled, previous.line_enabled),
    kinds: {
      chat: boolean_value(
        (incoming as Record<string, unknown>).new_chat ?? incoming_kinds.chat,
        previous.kinds.chat,
      ),
      reservation: boolean_value(
        (incoming as Record<string, unknown>).reservation ??
          incoming_kinds.reservation,
        previous.kinds.reservation,
      ),
      announcement: boolean_value(
        (incoming as Record<string, unknown>).announcement ??
          incoming_kinds.announcement,
        previous.kinds.announcement,
      ),
    },
  }
  const settings_json = to_settings_json(preferences)

  await debug_notification_setting('notification_setting_request', {
    user_uuid,
    request_body: input.request_body ?? null,
    parsed_json: input.preferences ?? null,
    enabled_flags: settings_json,
    phase: 'upsert_notification_settings',
  })

  const update = await supabase
    .from('notification_settings')
    .upsert({
      user_uuid,
      settings: settings_json,
      updated_at: new Date().toISOString(),
    })

  if (update.error) {
    await debug_notification_setting('notification_setting_response', {
      user_uuid,
      request_body: input.request_body ?? null,
      parsed_json: input.preferences ?? null,
      enabled_flags: settings_json,
      error_code: update.error.code,
      error_message: update.error.message,
      error_details: error_field(update.error, 'details'),
      error_hint: error_field(update.error, 'hint'),
      phase: 'upsert_notification_settings',
    })

    return {
      ok: false as const,
      error: update.error.message,
      preferences,
    }
  }

  await debug_notification_setting('notification_setting_response', {
    user_uuid,
    request_body: input.request_body ?? null,
    parsed_json: input.preferences ?? null,
    enabled_flags: settings_json,
    error_code: null,
    error_message: null,
    error_details: null,
    phase: 'upsert_notification_settings',
  })

  return {
    ok: true as const,
    preferences,
  }
}
