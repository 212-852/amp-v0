import 'server-only'

import { control } from '@/lib/config/control'

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
    }

export type notify_channel = 'discord' | 'line' | 'push'

export type notify_target = 'admin' | 'concierge' | 'owner' | 'core'

export type notify_rule = {
  category?:
    | 'concierge_requested'
    | 'concierge_closed'
    | 'admin_internal_name_updated'
    | 'support_started'
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

  if (event.event === 'admin_internal_name_updated') {
    return true
  }

  if (event.event === 'support_started') {
    return control.notify.support_started
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
      channels: ['discord'],
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

export function format_support_started_notify_content(
  event: Extract<notify_event, { event: 'support_started' }>,
): string {
  return [
    `${event.admin_display_label} が対応を始めました`,
    `room_uuid: ${event.room_uuid}`,
    `customer_display_name: ${event.customer_display_name}`,
    `admin_internal_name: ${event.admin_internal_name ?? 'none'}`,
    `action_uuid: ${event.action_uuid}`,
    `created_at: ${event.created_at}`,
  ].join('\n')
}
