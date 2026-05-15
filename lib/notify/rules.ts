import 'server-only'

import { control } from '@/lib/config/control'
import type { notification_primary_channel } from '@/lib/notification/rules'

export type notify_event =
  | {
      event: 'new_user_created'
      provider: string
      user_uuid: string
      visitor_uuid: string
      display_name?: string | null
      locale?: string | null
      is_new_user: boolean
      is_new_visitor: boolean
    }
  | {
      event: 'concierge_room_request'
      room_uuid: string
      visitor_uuid: string | null
      user_uuid: string | null
      channel: string
    }
  | {
      event: 'concierge_requested'
      room_uuid: string
      participant_uuid: string
      visitor_uuid: string | null
      user_uuid: string | null
      source_channel: string
      mode: 'concierge'
      action_id: string | null
    }
  | {
      event: 'concierge_closed'
      room_uuid: string
      mode: 'bot'
      action_id: string | null
    }
  | {
      event: 'line_push'
      line_user_id: string
      message: string
    }
  | {
      event: 'new_chat'
      user_uuid: string
      room_uuid: string
      participant_uuid?: string | null
      message_uuid?: string | null
      message: string
      sender_internal_name?: string | null
      sender_user_uuid?: string | null
      sender_role?: string | null
      source_channel: string
    }
  | {
      event: 'admin_internal_name_updated'
      admin_user_uuid: string
      old_internal_name: string | null
      new_internal_name: string
      updated_by_user_uuid: string
      updated_at: string
      source_channel: string
    }
  | {
      event: 'debug_trace'
      category: string
      debug_event: string
      payload: Record<string, unknown>
    }
  | {
      event: 'support_started'
      room_uuid: string
      action_uuid: string
      created_at: string
      admin_display_label: string
      customer_display_name: string
      admin_internal_name: string | null
      admin_user_uuid: string
      admin_participant_uuid: string | null
      customer_user_uuid: string | null
      customer_participant_uuid: string | null
      discord_thread_action_id: string | null
      source_channel: string
      started_at: string
    }
  | {
      event: 'admin_notification'
      admin_event:
        | 'support_started'
        | 'new_user_message'
        | 'review_needed'
        | 'system_alert'
      room_uuid?: string | null
      message_uuid?: string | null
      message: string
      title?: string | null
      actor_user_uuid?: string | null
      source_channel: string
    }

export type notify_channel = 'discord' | 'discord_action' | 'line' | 'push'

export type notify_target = 'admin' | 'concierge' | 'owner' | 'core'

export type notify_rule = {
  category?:
    | 'concierge_requested'
    | 'concierge_closed'
    | 'admin_internal_name_updated'
    | 'support_started'
    | 'admin_notification'
  priority?: 'high' | 'normal'
  targets?: notify_target[]
  channels: notify_channel[]
}

/**
 * Pure decision: which roles should receive a `concierge_requested`
 * notification given the current reception summary.
 *
 * - At least one open admin → admins/concierge are the primary targets;
 *   owner/core stay on the broadcast for visibility.
 * - No open admin → admin/concierge are dropped, escalation goes to
 *   owner/core only.
 *
 * Logic only. Delivery is performed by `notify/index.ts`.
 */
export function resolve_concierge_targets(input: {
  has_open_admin: boolean
}): notify_target[] {
  if (input.has_open_admin) {
    return ['admin', 'concierge', 'owner', 'core']
  }

  return ['owner', 'core']
}

/**
 * User `settings.notification_preferences` uses `primary_channel` (`push` | `line` | null):
 * at most one external channel is active; chat delivery follows
 * `resolve_chat_external_notification_route` in `lib/notification/rules.ts`.
 */

/**
 * Push subscription policy for notify (see `resolve_push_subscription_enabled_for_notify`):
 * `push_subscription_enabled` means a `push_subscriptions` row exists for the user with
 * `enabled = true`, a non-empty `endpoint`, using the latest row (`updated_at` desc, limit 1).
 * Unsubscribe sets `enabled = false` (row retained). Delivery queries match the same filter.
 */

export function should_send_notify(event: notify_event) {
  if (event.event === 'new_user_created') {
    return control.notify.new_user_created
  }

  if (event.event === 'concierge_room_request') {
    return control.notify.concierge_room_request
  }

  if (
    event.event === 'concierge_requested' ||
    event.event === 'concierge_closed'
  ) {
    return control.notify.concierge_room_request
  }

  if (event.event === 'line_push') {
    return true
  }

  if (event.event === 'new_chat') {
    return true
  }

  if (event.event === 'admin_internal_name_updated') {
    return true
  }

  if (event.event === 'support_started') {
    return control.notify.support_started
  }

  if (event.event === 'admin_notification') {
    return true
  }

  if (event.event === 'debug_trace') {
    return control.notify.debug_trace
  }

  return false
}

export function resolve_notify_rule(event: notify_event): notify_rule {
  if (!should_send_notify(event)) {
    return {
      channels: [],
    }
  }

  if (event.event === 'new_user_created') {
    return {
      channels: ['discord'],
    }
  }

  if (event.event === 'concierge_room_request') {
    return {
      channels: ['discord'],
    }
  }

  if (event.event === 'concierge_requested') {
    return {
      category: 'concierge_requested',
      priority: 'high',
      channels: ['push', 'line', 'discord'],
    }
  }

  if (event.event === 'concierge_closed') {
    return {
      category: 'concierge_closed',
      priority: 'normal',
      targets: ['admin', 'concierge', 'owner', 'core'],
      channels: ['discord'],
    }
  }

  if (event.event === 'line_push') {
    return {
      channels: ['line'],
    }
  }

  if (event.event === 'new_chat') {
    return {
      priority: 'normal',
      channels: ['push'],
    }
  }

  if (event.event === 'admin_internal_name_updated') {
    return {
      category: 'admin_internal_name_updated',
      priority: 'normal',
      targets: ['owner', 'core'],
      channels: ['discord'],
    }
  }

  if (event.event === 'support_started') {
    return {
      category: 'support_started',
      priority: 'normal',
      channels: ['push', 'discord_action'],
    }
  }

  if (event.event === 'admin_notification') {
    return {
      category: 'admin_notification',
      priority:
        event.admin_event === 'system_alert' ||
        event.admin_event === 'review_needed'
          ? 'high'
          : 'normal',
      targets: ['admin', 'owner', 'core'],
      channels: ['push', 'discord_action'],
    }
  }

  if (event.event === 'debug_trace') {
    return {
      channels: ['discord'],
    }
  }

  return {
    channels: [],
  }
}

export type push_sender_title_source =
  | 'admin_internal_name'
  | 'profile_internal_name'
  | 'users_display_name'
  | 'fallback'

function trim_nonempty(value: string | null | undefined): string | null {
  const t = typeof value === 'string' ? value.trim() : ''

  return t.length > 0 ? t : null
}

/**
 * Push notification title for staff-originated messages: profiles.internal_name
 * first when sender is admin, then profiles.display_name/users.display_name,
 * then fixed operator label.
 */
export function resolve_push_notification_title(input: {
  sender_role: string | null
  profile_internal_name: string | null
  users_display_name: string | null
}): { title: string; source: push_sender_title_source } {
  const internal = trim_nonempty(input.profile_internal_name)
  const disp = trim_nonempty(input.users_display_name)
  const is_admin = input.sender_role === 'admin'

  if (is_admin && internal) {
    return { title: internal, source: 'admin_internal_name' }
  }

  if (internal) {
    return { title: internal, source: 'profile_internal_name' }
  }

  if (disp) {
    return { title: disp, source: 'users_display_name' }
  }

  return { title: '\u904b\u55b6', source: 'fallback' }
}

export type line_notify_last_channel = 'line' | 'liff' | 'pwa' | 'web' | null

export function normalize_line_notify_last_channel(
  raw: string | null | undefined,
): line_notify_last_channel {
  const t = trim_nonempty(raw)

  if (t === 'line' || t === 'liff' || t === 'pwa' || t === 'web') {
    return t
  }

  return null
}

export function resolve_line_new_chat_should_include_body(input: {
  primary_channel: notification_primary_channel
  last_channel: line_notify_last_channel
}): boolean {
  if (input.primary_channel !== 'line') {
    return false
  }

  return input.last_channel === 'line' || input.last_channel === 'liff'
}

function trim_line_push_body(value: string, max: number): string {
  const cleaned = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()

  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}\u2026` : cleaned
}

const line_notify_default_title =
  '\u65b0\u3057\u3044\u30e1\u30c3\u30bb\u30fc\u30b8\u304c\u3042\u308a\u307e\u3059'
const line_notify_default_body =
  '\u30e1\u30c3\u30bb\u30fc\u30b8\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044'

export function resolve_line_new_chat_display_copy(input: {
  primary_channel: notification_primary_channel
  last_channel: line_notify_last_channel
  message_text: string
}): { title: string; body: string; should_include_body: boolean } {
  const should = resolve_line_new_chat_should_include_body({
    primary_channel: input.primary_channel,
    last_channel: input.last_channel,
  })
  const snippet = trim_nonempty(input.message_text)

  if (should && snippet) {
    return {
      title: line_notify_default_title,
      body: trim_line_push_body(snippet, 900),
      should_include_body: true,
    }
  }

  return {
    title: line_notify_default_title,
    body: line_notify_default_body,
    should_include_body: false,
  }
}

function trim_trailing_slash(origin: string): string {
  return origin.replace(/\/+$/, '')
}

export function resolve_line_new_chat_open_url(input: {
  last_channel: line_notify_last_channel
  room_uuid: string | null | undefined
  app_origin: string
  liff_id: string
}): string {
  const base_raw = trim_nonempty(input.app_origin)
  const base = trim_trailing_slash(base_raw ?? 'https://app.da-nya.com')
  const room = trim_nonempty(input.room_uuid ?? null)
  const user_with_room = room
    ? `${base}/user?room_uuid=${encodeURIComponent(room)}`
    : `${base}/user`
  const liff = trim_nonempty(input.liff_id)

  if (input.last_channel === 'line' || input.last_channel === 'liff') {
    if (!liff) {
      return user_with_room
    }

    return room
      ? `https://liff.line.me/${liff}?room_uuid=${encodeURIComponent(room)}`
      : `https://liff.line.me/${liff}`
  }

  return user_with_room
}

export function format_support_started_notify_content(
  event: Extract<notify_event, { event: 'support_started' }>,
): string {
  return [
    '[SUPPORT STARTED]',
    '',
    `${event.admin_display_label} が対応を始めました`,
    `customer_display_name: ${event.customer_display_name}`,
    `room_uuid: ${event.room_uuid}`,
    `admin_internal_name: ${event.admin_internal_name ?? 'none'}`,
    `source_channel: ${event.source_channel}`,
    `started_at: ${event.started_at}`,
    `action_uuid: ${event.action_uuid}`,
    `created_at: ${event.created_at}`,
  ].join('\n')
}

export type { push_chat_gate_result } from './push_gate'

export {
  evaluate_push_chat_delivery_allowed,
  resolve_push_subscription_enabled_for_notify,
} from './push_gate'
