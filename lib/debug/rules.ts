import 'server-only'

import { debug_control } from './control'

export type debug_level = 'info' | 'warn' | 'error'
export type debug_channel = 'discord'

export type debug_rule = {
  category: string
  level: debug_level
  channels: debug_channel[]
}

export function resolve_debug_rule(input: {
  category: string
  event: string
  payload?: Record<string, unknown>
}): debug_rule {
  if (
    input.event === 'handoff_memo_save_blocked' ||
    input.event === 'handoff_memo_save_failed' ||
    input.event === 'handoff_memo_list_failed'
  ) {
    return {
      category: 'handoff_memo',
      level: 'error',
      channels: ['discord'],
    }
  }

  if (input.event === 'handoff_memo_save_started') {
    return {
      category: 'handoff_memo',
      level: 'info',
      channels: debug_control.handoff_memo_debug_enabled
        ? ['discord']
        : [],
    }
  }

  if (input.event === 'handoff_memo_save_succeeded') {
    return {
      category: 'handoff_memo',
      level: 'info',
      channels: debug_control.handoff_memo_debug_enabled
        ? ['discord']
        : [],
    }
  }

  const admin_management_events = new Set([
    'admin_profile_save_started',
    'admin_profile_save_failed',
    'admin_profile_save_succeeded',
    'admin_internal_name_notify_failed',
    'admin_internal_name_notify_succeeded',
  ])

  if (
    input.category === 'admin_management' &&
    admin_management_events.has(input.event)
  ) {
    const is_failed =
      input.event === 'admin_profile_save_failed' ||
      input.event === 'admin_internal_name_notify_failed'

    return {
      category: 'admin_management',
      level: is_failed ? 'error' : 'info',
      channels:
        is_failed || debug_control.admin_management_debug_enabled
          ? ['discord']
          : [],
    }
  }

  if (
    input.category === 'chat_message' &&
    input.event === 'chat_message_insert_succeeded'
  ) {
    return {
      category: 'chat_message',
      level: 'info',
      channels: debug_control.realtime_verbose_debug_enabled
        ? ['discord']
        : [],
    }
  }

  const chat_message_events = new Set([
    'chat_message_send_started',
    'chat_message_send_blocked',
    'chat_message_send_failed',
    'chat_message_send_succeeded',
  ])

  const concierge_list_debug_events = new Set([
    'concierge_room_filtered',
    'concierge_room_display_name_missing',
  ])

  if (
    input.category === 'admin_chat' &&
    concierge_list_debug_events.has(input.event)
  ) {
    return {
      category: 'admin_chat',
      level:
        input.event === 'concierge_room_display_name_missing'
          ? 'warn'
          : 'info',
      channels: debug_control.admin_chat_room_list_debug_enabled
        ? ['discord']
        : [],
    }
  }

  const admin_chat_list_lifecycle_events = new Set([
    'admin_chat_list_load_started',
    'admin_chat_list_query_succeeded',
  ])

  if (
    input.category === 'admin_chat' &&
    admin_chat_list_lifecycle_events.has(input.event)
  ) {
    return {
      category: 'admin_chat',
      level: 'info',
      channels: ['discord'],
    }
  }

  const admin_chat_list_problem_events = new Set([
    'admin_chat_list_query_failed',
    'admin_chat_list_filtered_empty',
    'admin_chat_list_normalize_failed',
  ])

  if (
    input.category === 'admin_chat' &&
    admin_chat_list_problem_events.has(input.event)
  ) {
    return {
      category: 'admin_chat',
      level:
        input.event === 'admin_chat_list_query_failed'
          ? 'error'
          : 'warn',
      channels: ['discord'],
    }
  }

  if (
    input.category === 'admin_chat' &&
    input.event === 'admin_chat_schema_columns_loaded'
  ) {
    return {
      category: 'admin_chat',
      level: 'info',
      channels: debug_control.admin_chat_room_list_debug_enabled
        ? ['discord']
        : [],
    }
  }

  if (
    input.category === 'admin_chat' &&
    input.event === 'admin_chat_customer_identity_payload_shape'
  ) {
    return {
      category: 'admin_chat',
      level: 'info',
      channels: debug_control.admin_chat_room_list_debug_enabled
        ? ['discord']
        : [],
    }
  }

  const customer_identity_resolve_lifecycle = new Set([
    'admin_chat_customer_identity_resolve_started',
    'admin_chat_customer_identity_resolve_succeeded',
  ])

  if (
    input.category === 'admin_chat' &&
    customer_identity_resolve_lifecycle.has(input.event)
  ) {
    return {
      category: 'admin_chat',
      level: 'info',
      channels: debug_control.admin_chat_room_list_debug_enabled
        ? ['discord']
        : [],
    }
  }

  if (
    input.category === 'admin_chat' &&
    input.event === 'admin_chat_customer_identity_resolve_failed'
  ) {
    return {
      category: 'admin_chat',
      level: 'warn',
      channels: ['discord'],
    }
  }

  const support_started_ok_debug = new Set([
    'support_started_action_created',
    'support_started_notify_started',
    'support_started_notify_succeeded',
  ])

  if (
    input.category === 'admin_chat' &&
    support_started_ok_debug.has(input.event)
  ) {
    return {
      category: 'admin_chat',
      level: 'info',
      channels: debug_control.support_started_debug_enabled
        ? ['discord']
        : [],
    }
  }

  if (
    input.category === 'admin_chat' &&
    input.event === 'support_started_notify_failed'
  ) {
    return {
      category: 'admin_chat',
      level: 'error',
      channels: ['discord'],
    }
  }

  if (
    input.category === 'chat_message' &&
    chat_message_events.has(input.event)
  ) {
    const is_failed =
      input.event === 'chat_message_send_blocked' ||
      input.event === 'chat_message_send_failed'

    return {
      category: 'chat_message',
      level: is_failed ? 'error' : 'info',
      channels:
        is_failed || debug_control.chat_message_debug_enabled
          ? ['discord']
          : [],
    }
  }

  const chat_realtime_always_discord = new Set([
    'chat_realtime_subscribe_failed',
    'chat_realtime_message_callback_ignored',
    'chat_realtime_typing_callback_ignored',
    'chat_realtime_action_callback_ignored',
    'chat_realtime_cleanup_started',
    'chat_realtime_cleanup_completed',
    'chat_typing_broadcast_failed',
    'chat_typing_listener_not_registered',
    'chat_typing_send_before_subscribed',
  ])

  const chat_realtime_success_gated = new Set([
    'chat_realtime_client_created',
    'chat_realtime_channel_created',
    'chat_realtime_subscribe_started',
    'chat_realtime_subscribe_skipped',
    'chat_realtime_channel_subscribe_status',
    'chat_realtime_subscribe_status',
    'chat_realtime_postgres_changes_callback_fired',
    'chat_realtime_message_callback_received',
    'chat_realtime_message_state_updated',
    'chat_realtime_typing_callback_received',
    'chat_realtime_action_callback_received',
    'chat_typing_identity_compare',
    'chat_typing_channel_instance_created',
    'chat_typing_listener_registered',
    'chat_typing_listener_callback_received',
    'chat_typing_broadcast_send_succeeded',
    'chat_typing_broadcast_received',
    'chat_typing_state_updated',
    'chat_support_started_insert_started',
    'chat_support_started_insert_succeeded',
  ])

  const chat_realtime_server_failed = new Set([
    'chat_support_started_insert_failed',
  ])

  if (
    input.category === 'chat_realtime' &&
    chat_realtime_server_failed.has(input.event)
  ) {
    return {
      category: 'chat_realtime',
      level: 'error',
      channels: ['discord'],
    }
  }

  if (
    input.category === 'chat_realtime' &&
    chat_realtime_always_discord.has(input.event)
  ) {
    const is_error =
      input.event === 'chat_realtime_subscribe_failed' ||
      input.event === 'chat_typing_broadcast_failed'

    return {
      category: 'chat_realtime',
      level: is_error ? 'error' : 'warn',
      channels: ['discord'],
    }
  }

  if (
    input.category === 'chat_realtime' &&
    input.event === 'chat_typing_broadcast_ignored'
  ) {
    const ignored_reason =
      typeof input.payload?.ignored_reason === 'string'
        ? input.payload.ignored_reason
        : null

    return {
      category: 'chat_realtime',
      level: 'warn',
      channels:
        ignored_reason === 'self_typing' &&
        !debug_control.realtime_verbose_debug_enabled
          ? []
          : ['discord'],
    }
  }

  if (
    input.category === 'chat_realtime' &&
    input.event === 'chat_realtime_subscribe_status'
  ) {
    const status =
      typeof input.payload?.subscribe_status === 'string'
        ? input.payload.subscribe_status
        : null
    const is_failed =
      status === 'CHANNEL_ERROR' ||
      status === 'TIMED_OUT' ||
      status === 'CLOSED'

    return {
      category: 'chat_realtime',
      level: is_failed ? 'error' : 'info',
      channels:
        is_failed || debug_control.realtime_verbose_debug_enabled
          ? ['discord']
          : [],
    }
  }

  if (
    input.category === 'chat_realtime' &&
    chat_realtime_success_gated.has(input.event)
  ) {
    return {
      category: 'chat_realtime',
      level: 'info',
      channels:
        debug_control.chat_realtime_debug_enabled ||
        debug_control.realtime_verbose_debug_enabled
          ? ['discord']
          : [],
    }
  }

  return {
    category: input.category,
    level: 'info',
    channels: ['discord'],
  }
}
