import 'server-only'

import { get_session_user } from '@/lib/auth/route'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'
import {
  default_notification_preferences,
  normalize_notification_preferences,
  notification_preferences_to_json,
  type notification_preferences,
} from './rules'
import {
  enforce_notification_method_selection,
  type notification_method_trigger,
} from './settings_core'

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
    .from('settings')
    .select('notification_preferences')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (settings.error) {
    return {
      ok: false as const,
      error: settings.error.message,
      preferences: default_notification_preferences,
    }
  }

  const row = settings.data as { notification_preferences?: unknown } | null

  const normalized = normalize_notification_preferences(
    row?.notification_preferences ?? null,
  )
  const adjusted = enforce_notification_method_selection({
    previous: default_notification_preferences,
    next: normalized,
    trigger_method: null,
  })

  return {
    ok: true as const,
    preferences: adjusted.preferences,
  }
}

export async function save_notification_settings(input: {
  preferences: Partial<notification_preferences> | null | undefined
  trigger_method?: notification_method_trigger
  request_body?: unknown
}) {
  const session = await get_session_user()
  const user_uuid = clean_uuid(session.user_uuid)

  await debug_notification_setting('notification_setting_payload', {
    user_uuid,
    request_body: input.request_body ?? null,
    parsed_json: input.preferences ?? null,
    enabled_flags: input.preferences ?? null,
    primary_channel: input.preferences?.primary_channel ?? null,
    push_enabled: input.preferences?.pwa_push_enabled ?? false,
    line_enabled: input.preferences?.line_enabled ?? false,
    selected_route:
      input.preferences?.primary_channel === 'push' ||
      input.preferences?.primary_channel === 'line'
        ? input.preferences.primary_channel
        : null,
    skipped_reason:
      input.preferences?.primary_channel === 'none'
        ? 'primary_channel_none'
        : null,
    phase: 'save_notification_settings',
  })

  if (!user_uuid) {
    await debug_notification_setting('notification_setting_validation_failed', {
      user_uuid,
      request_body: input.request_body ?? null,
      parsed_json: input.preferences ?? null,
      enabled_flags: input.preferences ?? null,
      primary_channel: input.preferences?.primary_channel ?? null,
      push_enabled: input.preferences?.pwa_push_enabled ?? false,
      line_enabled: input.preferences?.line_enabled ?? false,
      selected_route:
        input.preferences?.primary_channel === 'push' ||
        input.preferences?.primary_channel === 'line'
          ? input.preferences.primary_channel
          : null,
      skipped_reason:
        input.preferences?.primary_channel === 'none'
          ? 'primary_channel_none'
          : null,
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
    .from('settings')
    .select('notification_preferences')
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
      phase: 'select_settings_notification_preferences',
    })

    return {
      ok: false as const,
      error: current_settings.error.message,
      preferences: default_notification_preferences,
    }
  }

  const current_row = current_settings.data as {
    notification_preferences?: unknown
  } | null
  const source = current_row?.notification_preferences ?? null
  const previous = normalize_notification_preferences(source)
  const incoming = input.preferences ?? {}
  const incoming_record = incoming as Record<string, unknown>

  const merged_record: Record<string, unknown> = {
    primary_channel:
      incoming_record.primary_channel !== undefined
        ? incoming_record.primary_channel
        : previous.primary_channel,
    pwa_push_enabled:
      incoming.pwa_push_enabled !== undefined
        ? incoming.pwa_push_enabled
        : incoming_record.push_enabled !== undefined
          ? incoming_record.push_enabled
          : previous.pwa_push_enabled,
    line_enabled:
      incoming.line_enabled !== undefined
        ? incoming.line_enabled
        : previous.line_enabled,
  }

  const requested_preferences = normalize_notification_preferences(merged_record)
  const method_adjustment = enforce_notification_method_selection({
    previous,
    next: requested_preferences,
    trigger_method: input.trigger_method ?? null,
  })
  const preferences = method_adjustment.preferences
  const preferences_json = notification_preferences_to_json(preferences)

  if (method_adjustment.invalid_both_off_prevented) {
    await debug_notification_setting(
      'notification_method_invalid_both_off_prevented',
      {
        user_uuid,
        request_body: input.request_body ?? null,
        previous_pwa_enabled: method_adjustment.previous_pwa_enabled,
        previous_line_enabled: method_adjustment.previous_line_enabled,
        us_pwa_enabled: method_adjustment.previous_pwa_enabled,
        next_pwa_enabled: method_adjustment.next_pwa_enabled,
        next_line_enabled: method_adjustment.next_line_enabled,
        trigger_method: method_adjustment.trigger_method,
        phase: 'notification_settings_method_guard',
      },
    )
  }

  if (method_adjustment.auto_adjusted) {
    await debug_notification_setting('notification_method_auto_adjust_started', {
      user_uuid,
      request_body: input.request_body ?? null,
      previous_pwa_enabled: method_adjustment.previous_pwa_enabled,
      previous_line_enabled: method_adjustment.previous_line_enabled,
      us_pwa_enabled: method_adjustment.previous_pwa_enabled,
      next_pwa_enabled: method_adjustment.next_pwa_enabled,
      next_line_enabled: method_adjustment.next_line_enabled,
      trigger_method: method_adjustment.trigger_method,
      phase: 'notification_settings_method_guard',
    })
  }

  await debug_notification_setting('notification_setting_request', {
    user_uuid,
    request_body: input.request_body ?? null,
    parsed_json: input.preferences ?? null,
    enabled_flags: preferences_json,
    primary_channel: preferences.primary_channel,
    push_enabled: preferences.pwa_push_enabled,
    line_enabled: preferences.line_enabled,
    selected_route:
      preferences.primary_channel === 'push' ||
      preferences.primary_channel === 'line'
        ? preferences.primary_channel
        : null,
    skipped_reason:
      preferences.primary_channel === 'none'
        ? 'primary_channel_none'
        : null,
    phase: 'upsert_notification_settings',
  })

  const update = await supabase
    .from('settings')
    .upsert({
      user_uuid,
      notification_preferences: preferences_json,
      updated_at: new Date().toISOString(),
    })

  if (update.error) {
    await debug_notification_setting('notification_setting_response', {
      user_uuid,
      request_body: input.request_body ?? null,
      parsed_json: input.preferences ?? null,
      enabled_flags: preferences_json,
      primary_channel: preferences.primary_channel,
      push_enabled: preferences.pwa_push_enabled,
      line_enabled: preferences.line_enabled,
      selected_route:
        preferences.primary_channel === 'push' ||
        preferences.primary_channel === 'line'
          ? preferences.primary_channel
          : null,
      skipped_reason:
        preferences.primary_channel === 'none'
          ? 'primary_channel_none'
          : null,
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
    enabled_flags: preferences_json,
    primary_channel: preferences.primary_channel,
    push_enabled: preferences.pwa_push_enabled,
    line_enabled: preferences.line_enabled,
    selected_route:
      preferences.primary_channel === 'push' ||
      preferences.primary_channel === 'line'
        ? preferences.primary_channel
        : null,
    skipped_reason:
      preferences.primary_channel === 'none'
        ? 'primary_channel_none'
        : null,
    error_code: null,
    error_message: null,
    error_details: null,
    phase: 'upsert_notification_settings',
  })

  if (method_adjustment.auto_adjusted) {
    await debug_notification_setting(
      'notification_method_auto_adjust_completed',
      {
        user_uuid,
        request_body: input.request_body ?? null,
        previous_pwa_enabled: method_adjustment.previous_pwa_enabled,
        previous_line_enabled: method_adjustment.previous_line_enabled,
        us_pwa_enabled: method_adjustment.previous_pwa_enabled,
        next_pwa_enabled: method_adjustment.next_pwa_enabled,
        next_line_enabled: method_adjustment.next_line_enabled,
        trigger_method: method_adjustment.trigger_method,
        phase: 'notification_settings_method_guard',
      },
    )
  }

  return {
    ok: true as const,
    preferences,
    auto_adjusted: method_adjustment.auto_adjusted,
  }
}
