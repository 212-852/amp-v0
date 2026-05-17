import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import type { external_notification_presence_decision } from '@/lib/presence/rules'

import {
  default_notification_preferences,
  normalize_notification_preferences,
  type notification_preferences,
  type notification_primary_channel,
} from '@/lib/notification/rules'

export type parsed_notify_settings = {
  preferences: notification_preferences
  raw_settings: Record<string, unknown> | null
  parsed_selected_channel: notification_primary_channel
  parsed_line_enabled: boolean
  parsed_push_enabled: boolean
}

function boolean_from(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === 'true' || value === 1 || value === '1') {
    return true
  }

  if (value === 'false' || value === 0 || value === '0') {
    return false
  }

  return null
}

function parse_channel_value(
  value: unknown,
): notification_primary_channel | null {
  if (value === 'push' || value === 'line' || value === 'none') {
    return value
  }

  if (value === 'pwa') {
    return 'push'
  }

  return null
}

function nested_notification_preferences(
  source: Record<string, unknown>,
): Record<string, unknown> | null {
  const nested = source.notification_preferences

  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>
  }

  return null
}

export function parse_notification_settings_json(
  raw_notification_preferences: unknown,
  raw_settings_row?: Record<string, unknown> | null,
): parsed_notify_settings {
  const pref_obj =
    raw_notification_preferences &&
    typeof raw_notification_preferences === 'object' &&
    !Array.isArray(raw_notification_preferences)
      ? (raw_notification_preferences as Record<string, unknown>)
      : {}
  const row =
    raw_settings_row &&
    typeof raw_settings_row === 'object' &&
    !Array.isArray(raw_settings_row)
      ? raw_settings_row
      : {}
  const nested = nested_notification_preferences(pref_obj) ?? {}
  const channels_obj =
    pref_obj.channels && typeof pref_obj.channels === 'object'
      ? (pref_obj.channels as Record<string, unknown>)
      : nested.channels && typeof nested.channels === 'object'
        ? (nested.channels as Record<string, unknown>)
        : {}
  const kinds_obj =
    pref_obj.kinds && typeof pref_obj.kinds === 'object'
      ? (pref_obj.kinds as Record<string, unknown>)
      : {}
  const chat_kinds =
    kinds_obj.chat && typeof kinds_obj.chat === 'object'
      ? (kinds_obj.chat as Record<string, unknown>)
      : null

  const explicit_channel =
    parse_channel_value(row.channel) ??
    parse_channel_value(pref_obj.channel) ??
    parse_channel_value(nested.channel) ??
    parse_channel_value(pref_obj.primary_channel) ??
    parse_channel_value(nested.primary_channel) ??
    (boolean_from(channels_obj.line) === true
      ? 'line'
      : boolean_from(channels_obj.push) === true ||
          boolean_from(channels_obj.pwa) === true
        ? 'push'
        : null)

  let line_enabled =
    boolean_from(pref_obj.line_enabled) ??
    boolean_from(nested.line_enabled) ??
    boolean_from(row.line_enabled) ??
    boolean_from(channels_obj.line) ??
    boolean_from(chat_kinds?.line) ??
    null

  let push_enabled =
    boolean_from(pref_obj.pwa_push_enabled) ??
    boolean_from(pref_obj.push_enabled) ??
    boolean_from(nested.pwa_push_enabled) ??
    boolean_from(nested.push_enabled) ??
    boolean_from(row.push_enabled) ??
    boolean_from(channels_obj.push) ??
    boolean_from(channels_obj.pwa) ??
    boolean_from(chat_kinds?.push) ??
    null

  if (explicit_channel === 'line') {
    line_enabled = true
    if (push_enabled !== true) {
      push_enabled = false
    }
  }

  if (explicit_channel === 'push') {
    push_enabled = true
  }

  if (boolean_from(channels_obj.line) === true) {
    line_enabled = true
  }

  if (
    boolean_from(channels_obj.push) === true ||
    boolean_from(channels_obj.pwa) === true
  ) {
    push_enabled = true
  }

  const merged: Record<string, unknown> = {
    ...pref_obj,
    ...nested,
    primary_channel: explicit_channel ?? pref_obj.primary_channel ?? nested.primary_channel,
    line_enabled: line_enabled ?? undefined,
    pwa_push_enabled: push_enabled ?? undefined,
    push_enabled: push_enabled ?? undefined,
  }

  let preferences = normalize_notification_preferences(merged)

  if (explicit_channel === 'line' && !preferences.line_enabled) {
    preferences = {
      ...preferences,
      line_enabled: true,
      primary_channel: preferences.pwa_push_enabled ? 'push' : 'line',
    }
  }

  if (explicit_channel === 'push' && !preferences.pwa_push_enabled) {
    preferences = {
      ...preferences,
      pwa_push_enabled: true,
      primary_channel: preferences.line_enabled ? 'push' : 'push',
    }
  }

  if (
    line_enabled === true &&
    push_enabled !== true &&
    preferences.primary_channel === 'none'
  ) {
    preferences = {
      ...preferences,
      line_enabled: true,
      primary_channel: 'line',
    }
  }

  return {
    preferences,
    raw_settings: {
      ...row,
      notification_preferences: pref_obj,
    },
    parsed_selected_channel: preferences.primary_channel,
    parsed_line_enabled: preferences.line_enabled,
    parsed_push_enabled: preferences.pwa_push_enabled,
  }
}

export async function load_notify_settings_for_user(
  user_uuid: string | null,
): Promise<parsed_notify_settings | null> {
  const uuid = clean_uuid(user_uuid)

  if (!uuid) {
    return null
  }

  const result = await supabase
    .from('settings')
    .select('notification_preferences')
    .eq('user_uuid', uuid)
    .maybeSingle()

  if (result.error) {
    return null
  }

  const row = result.data as { notification_preferences?: unknown } | null

  return parse_notification_settings_json(row?.notification_preferences ?? null)
}

export type customer_external_notification_decision = {
  selected_channel: 'line' | 'push' | null
  selected_method: 'line' | 'push' | null
  skipped_reason: string | null
}

export function resolve_customer_external_notification_decision(input: {
  settings: parsed_notify_settings | null
  presence_decision: external_notification_presence_decision
  has_line_identity: boolean
  line_user_id_exists: boolean
  push_subscription_exists: boolean
  chat_notifications_enabled: boolean
}): customer_external_notification_decision {
  if (input.presence_decision.skip_external) {
    return {
      selected_channel: null,
      selected_method: null,
      skipped_reason:
        input.presence_decision.external_notification_skipped_reason ??
        'receiver_active_in_app',
    }
  }

  if (!input.chat_notifications_enabled) {
    return {
      selected_channel: null,
      selected_method: null,
      skipped_reason: 'chat_notifications_disabled',
    }
  }

  const settings = input.settings?.preferences ?? default_notification_preferences
  const line_enabled = input.settings?.parsed_line_enabled ?? settings.line_enabled
  const push_enabled = input.settings?.parsed_push_enabled ?? settings.pwa_push_enabled

  if (settings.primary_channel === 'line' && line_enabled) {
    if (!input.has_line_identity || !input.line_user_id_exists) {
      return {
        selected_channel: 'line',
        selected_method: null,
        skipped_reason: 'line_identity_missing',
      }
    }

    return {
      selected_channel: 'line',
      selected_method: 'line',
      skipped_reason: null,
    }
  }

  if (settings.primary_channel === 'push' && push_enabled) {
    if (!input.push_subscription_exists) {
      return {
        selected_channel: 'push',
        selected_method: null,
        skipped_reason: 'push_subscription_missing',
      }
    }

    return {
      selected_channel: 'push',
      selected_method: 'push',
      skipped_reason: null,
    }
  }

  if (line_enabled && input.has_line_identity && input.line_user_id_exists) {
    return {
      selected_channel: 'line',
      selected_method: 'line',
      skipped_reason: null,
    }
  }

  if (push_enabled && input.push_subscription_exists) {
    return {
      selected_channel: 'push',
      selected_method: 'push',
      skipped_reason: null,
    }
  }

  if (line_enabled && !input.has_line_identity) {
    return {
      selected_channel: 'line',
      selected_method: null,
      skipped_reason: 'line_identity_missing',
    }
  }

  if (push_enabled && !input.push_subscription_exists) {
    return {
      selected_channel: 'push',
      selected_method: null,
      skipped_reason: 'push_subscription_missing',
    }
  }

  return {
    selected_channel: null,
    selected_method: null,
    skipped_reason: line_enabled ? 'line_notification_off' : 'notification_settings_off',
  }
}
