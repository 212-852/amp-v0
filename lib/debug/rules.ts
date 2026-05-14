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
  if (input.category === 'chat_realtime') {
    return {
      category: 'chat_realtime',
      level: 'info',
      channels: [],
    }
  }

  const message_send_diagnostic_events = new Set([
    'chat_message_send_clicked',
    'user_message_send_clicked',
    'chat_message_send_started',
    'user_message_send_started',
    'chat_message_session_loaded',
    'user_message_session_checked',
    'chat_message_payload_built',
    'user_message_payload_built',
    'user_message_room_checked',
    'chat_message_room_checked',
    'chat_message_participant_checked',
    'user_message_participant_checked',
    'chat_message_api_room_validate_started',
    'user_message_api_room_validate_started',
    'chat_message_api_room_validate_succeeded',
    'user_message_api_room_validate_succeeded',
    'chat_message_api_room_validate_failed',
    'user_message_api_room_validate_failed',
    'chat_message_send_blocked',
    'user_message_send_blocked',
    'chat_message_insert_started',
    'user_message_insert_started',
    'chat_message_insert_succeeded',
    'user_message_insert_succeeded',
    'chat_message_insert_failed',
    'user_message_insert_failed',
    'user_message_archive_started',
    'chat_message_archive_started',
    'user_message_archive_succeeded',
    'chat_message_archive_succeeded',
    'user_message_archive_failed',
    'chat_message_archive_failed',
    'chat_message_send_failed',
    'user_message_send_failed',
    'chat_message_send_finished',
    'user_message_send_finished',
  ])

  if (
    (input.category === 'chat_message' || input.category === 'user_message') &&
    message_send_diagnostic_events.has(input.event)
  ) {
    const is_error =
      input.event.endsWith('_failed') ||
      input.event.endsWith('_blocked')

    return {
      category: input.category,
      level: is_error ? 'error' : 'info',
      channels: is_error ? ['discord'] : [],
    }
  }

  if (input.category === 'notification') {
    const is_failed = input.event.endsWith('_failed')

    return {
      category: 'notification',
      level: is_failed ? 'error' : 'info',
      channels: is_failed ? ['discord'] : [],
    }
  }

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

  if (
    input.category === 'admin_chat' &&
    input.event === 'support_started_notify_discord_id_missing'
  ) {
    const has_error =
      typeof input.payload?.error_message === 'string' &&
      input.payload.error_message.length > 0

    return {
      category: 'admin_chat',
      level: has_error ? 'warn' : 'info',
      channels: ['discord'],
    }
  }

  const support_started_ok_debug = new Set([
    'support_started_action_create_started',
    'support_started_action_create_succeeded',
    'support_started_notify_route_decided',
    'support_started_notify_started',
    'support_started_notify_succeeded',
    'support_started_notify_skipped',
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
    input.event === 'support_started_action_create_failed'
  ) {
    return {
      category: 'admin_chat',
      level: 'error',
      channels: ['discord'],
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

  const pwa_problem_events = new Set([
    'pwa_install_failed',
    'pwa_service_worker_register_failed',
    'pwa_session_restore_failed',
    'pwa_identity_link_failed',
    'pwa_line_link_poll_failed',
    'pwa_session_refresh_failed',
    'pwa_user_restore_failed',
    'pwa_link_poll_timeout',
    'pwa_link_start_request_failed',
    'pwa_line_auth_redirect_failed',
    'session_channel_mismatch_detected',
    'user_uuid_missing_after_link',
    'push_subscription_save_failed',
    'push_subscription_failed',
    'push_permission_denied',
  ])

  const pwa_discord_lifecycle_events = new Set([
    'pwa_install_menu_clicked',
    'pwa_install_modal_open_started',
    'pwa_install_modal_open_failed',
    'pwa_install_modal_opened',
    'pwa_install_locale_resolved',
    'pwa_install_os_detected',
    'pwa_install_button_rendered',
    'pwa_install_not_available',
    'pwa_install_prompt_available',
    'pwa_install_started',
    'pwa_install_accepted',
    'pwa_install_dismissed',
    'pwa_install_completed',
    'pwa_install_succeeded',
    'pwa_install_copy_clicked',
    'pwa_install_copy_succeeded',
    'pwa_install_copy_failed',
    'pwa_install_open_safari_clicked',
    'pwa_install_open_safari_succeeded',
    'pwa_manifest_loaded',
    'pwa_service_worker_register_started',
    'pwa_service_worker_register_succeeded',
    'pwa_installability_checked',
    'pwa_beforeinstallprompt_received',
    'pwa_beforeinstallprompt_missing',
    'pwa_session_restore_started',
    'pwa_session_restore_succeeded',
    'pwa_boot_loading_started',
    'pwa_boot_loading_finished',
    'pwa_user_restore_started',
    'pwa_user_restore_succeeded',
    'pwa_identity_link_started',
    'pwa_identity_link_succeeded',
    'pwa_line_link_started',
    'one_time_pass_opened',
    'one_time_pass_reused',
    'one_time_pass_completed',
    'one_time_pass_expired',
    'pwa_line_link_poll_started',
    'pwa_line_link_poll_completed',
    'line_callback_pass_received',
    'auth_link_start_api_entered',
    'auth_link_start_context_resolved',
    'auth_link_start_rules_passed',
    'auth_link_session_insert_started',
    'auth_link_session_insert_succeeded',
    'auth_link_session_insert_failed',
    'line_auth_url_build_started',
    'line_auth_url_build_succeeded',
    'line_auth_url_build_failed',
    'auth_link_start_response_sent',
    'auth_link_session_created',
    'auth_link_callback_received',
    'auth_link_session_completed',
    'pwa_line_auth_opened',
    'pwa_line_auth_redirect_started',
    'pwa_link_callback_page_rendered',
    'pwa_link_callback_completed_page_rendered',
    'pwa_link_callback_failed_page_rendered',
    'pwa_link_poll_started',
    'pwa_link_poll_completed',
    'pwa_link_start_clicked',
    'pwa_link_start_request_started',
    'pwa_link_start_request_succeeded',
    'pwa_session_refresh_started',
    'pwa_session_refresh_succeeded',
    'pwa_reload_triggered',
    'visitor_uuid_reused',
    'visitor_uuid_recreated',
    'user_uuid_restored',
    'welcome_message_skipped',
    'welcome_message_created',
    'visitor_user_attached',
    'participant_user_attached',
    'restore_from_visitor_succeeded',
    'restore_from_participant_succeeded',
    'restore_from_identity_succeeded',
    'restore_from_one_time_pass_succeeded',
    'chat_state_room_applied',
    'notification_modal_opened',
    'push_permission_requested',
    'push_permission_granted',
    'push_subscription_saved',
  ])

  if (input.category === 'pwa' && pwa_problem_events.has(input.event)) {
    return {
      category: 'pwa',
      level: 'error',
      channels: ['discord'],
    }
  }

  const notification_settings_debug_events = new Set([
    'notification_modal_opened',
    'notification_tab_changed',
    'push_toggle_clicked',
    'push_standalone_checked',
    'push_service_worker_checked',
    'push_permission_requested',
    'push_permission_granted',
    'push_permission_denied',
    'push_subscribe_started',
    'push_subscribe_succeeded',
    'push_subscription_save_started',
    'push_subscription_save_succeeded',
    'push_subscription_save_failed',
    'notification_setting_payload',
    'notification_setting_request',
    'notification_setting_response',
    'notification_setting_validation_failed',
    'notification_setting_save_started',
    'notification_setting_save_succeeded',
    'notification_setting_save_failed',
    'notify_push_preference_checked',
    'notify_push_subscription_checked',
    'notify_push_disabled_reason',
    'notify_push_send_started',
  ])

  if (
    input.category === 'pwa' &&
    notification_settings_debug_events.has(input.event)
  ) {
    const is_failed =
      input.event.endsWith('_failed') ||
      input.event === 'notification_setting_validation_failed' ||
      input.event === 'push_permission_denied' ||
      typeof input.payload?.error_code === 'string'

    return {
      category: 'pwa',
      level: is_failed ? 'error' : 'info',
      channels: ['discord'],
    }
  }

  if (input.category === 'pwa' && pwa_discord_lifecycle_events.has(input.event)) {
    return {
      category: 'pwa',
      level: 'info',
      channels: [],
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
      channels: is_failed ? ['discord'] : [],
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
    'toast_decision_started',
    'toast_shown',
    'toast_skipped',
    'toast_clicked',
    'toast_auto_hidden',
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

  const chat_room_lifecycle = new Set([
    'chat_messages_fetch_started',
    'chat_messages_fetch_succeeded',
    'chat_messages_fetch_failed',
    'chat_state_room_applied',
  ])

  if (
    input.category === 'chat_room' &&
    chat_room_lifecycle.has(input.event)
  ) {
    const is_failed = input.event.endsWith('_failed')

    return {
      category: 'chat_room',
      level: is_failed ? 'error' : 'info',
      channels: is_failed ? ['discord'] : [],
    }
  }

  if (
    input.category === 'chat_room' ||
    input.category === 'chat_message' ||
    input.category === 'user_message' ||
    input.category === 'pwa'
  ) {
    const is_failed =
      input.event.endsWith('_failed') ||
      input.event.endsWith('_blocked')

    return {
      category: input.category,
      level: is_failed ? 'error' : 'info',
      channels: is_failed ? ['discord'] : [],
    }
  }

  return {
    category: input.category,
    level: 'info',
    channels: ['discord'],
  }
}
