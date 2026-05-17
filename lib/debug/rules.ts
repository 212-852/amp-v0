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
    'output_reply_channel_resolved',
    'room_last_incoming_channel_updated',
    'output_reply_delivery_started',
    'output_reply_delivery_succeeded',
    'output_reply_delivery_failed',
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
    'profile_fetch_started',
    'profile_fetch_succeeded',
    'profile_save_clicked',
    'profile_save_payload_built',
    'profile_save_started',
    'profile_save_failed',
    'profile_save_succeeded',
    'admin_internal_name_notify_failed',
    'admin_internal_name_notify_succeeded',
  ])

  if (
    input.category === 'admin_management' &&
    admin_management_events.has(input.event)
  ) {
    const is_failed =
      input.event === 'profile_save_failed' ||
      input.event === 'admin_internal_name_notify_failed'

    const is_save_trace_anchor =
      input.event === 'profile_fetch_started' ||
      input.event === 'profile_fetch_succeeded' ||
      input.event === 'profile_save_clicked' ||
      input.event === 'profile_save_payload_built'

    return {
      category: 'admin_management',
      level: is_failed ? 'error' : 'info',
      channels:
        is_failed ||
        is_save_trace_anchor ||
        debug_control.admin_management_debug_enabled
          ? ['discord']
          : [],
    }
  }

  const chat_message_events = new Set([
    'chat_message_send_started',
    'chat_message_send_blocked',
    'chat_message_send_failed',
    'chat_message_send_succeeded',
    'output_reply_channel_resolved',
    'room_last_incoming_channel_updated',
    'output_reply_delivery_started',
    'output_reply_delivery_succeeded',
    'output_reply_delivery_failed',
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

  const admin_chat_reception_lifecycle_events = new Set([
    'admin_reception_runtime_mounted',
    'admin_reception_live_mounted',
    'support_lifecycle_mounted',
    'support_started_action_create_started',
    'support_started_action_create_succeeded',
    'support_started_duplicate_skipped',
    'support_stale_session_detected',
    'support_stale_session_closed',
    'admin_reception_page_rendered',
    'admin_reception_visible_room_rendered',
    'admin_reception_room_rendered',
    'admin_chat_component_mounted',
    'admin_chat_component_ready',
    'admin_chat_realtime_subscribe_started',
    'admin_chat_realtime_subscribe_succeeded',
    'admin_chat_realtime_payload_received',
    'admin_chat_realtime_payload_accepted',
    'admin_chat_realtime_payload_ignored',
    'enter_support_room_call_payload_built',
    'enter_support_room_skipped_missing_admin_identity',
    'admin_reception_list_realtime_subscribe_started',
    'admin_reception_list_message_received',
    'admin_reception_list_message_card_updated',
    'admin_reception_list_action_received',
    'admin_reception_list_action_card_updated',
    'admin_reception_list_cards_sorted',
  ])

  if (
    input.category === 'admin_chat' &&
    admin_chat_reception_lifecycle_events.has(input.event)
  ) {
    const payload = input.payload as Record<string, unknown> | undefined
    const has_error =
      Boolean(payload?.error_code) || Boolean(payload?.error_message)

    return {
      category: 'admin_chat',
      level: has_error ? 'warn' : 'info',
      channels: debug_control.admin_chat_lifecycle_discord_enabled
        ? ['discord']
        : [],
    }
  }

  const admin_chat_list_lifecycle_events = new Set([
    'admin_chat_list_load_started',
    'admin_chat_list_query_succeeded',
    'admin_room_filter_checked',
  ])

  if (
    input.category === 'admin_chat' &&
    admin_chat_list_lifecycle_events.has(input.event)
  ) {
    return {
      category: 'admin_chat',
      level: 'info',
      channels: debug_control.debug_full ? ['discord'] : [],
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

  const admin_room_unread_debug_events = new Set([
    'room_unread_incremented',
    'room_unread_mark_read_started',
    'room_unread_mark_read_succeeded',
  ])

  if (
    input.category === 'admin_chat' &&
    admin_room_unread_debug_events.has(input.event)
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
    'customer_display_name_resolved',
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
    'admin_support_enter_detected',
    'enter_support_room_started',
    'enter_support_room_skipped',
    'enter_support_room_succeeded',
    'enter_support_room_action_insert_started',
    'enter_support_room_action_insert_succeeded',
    'enter_support_room_realtime_emit_expected',
    'support_started_realtime_emit_started',
    'support_started_realtime_emit_succeeded',
    'support_started_discord_notify_started',
    'support_started_discord_notify_succeeded',
    'enter_support_room_completed',
    'support_started_action_create_started',
    'support_started_action_create_succeeded',
    'support_started_notify_route_decided',
    'support_started_notify_started',
    'support_started_notify_succeeded',
    'support_started_notify_skipped',
    'support_started_discord_send_started',
    'support_started_discord_send_succeeded',
    'support_started_discord_send_failed',
    'customer_notification_rule_checked',
    'customer_line_notification_rule_checked',
    'customer_line_notification_send_started',
    'customer_line_notification_send_succeeded',
    'customer_line_notification_skipped',
  ])

  if (
    input.category === 'admin_chat' &&
    support_started_ok_debug.has(input.event)
  ) {
    const keep_customer_line_debug =
      input.event === 'customer_notification_rule_checked' ||
      input.event === 'customer_line_notification_rule_checked' ||
      input.event === 'customer_line_notification_send_started' ||
      input.event === 'customer_line_notification_send_succeeded' ||
      input.event === 'customer_line_notification_skipped'

    return {
      category: 'admin_chat',
      level: 'info',
      channels: keep_customer_line_debug ||
        debug_control.debug_full ||
        debug_control.support_started_debug_enabled
        ? ['discord']
        : [],
    }
  }

  if (
    input.category === 'admin_chat' &&
    (input.event === 'support_started_action_create_failed' ||
      input.event === 'enter_support_room_failed')
  ) {
    return {
      category: 'admin_chat',
      level: 'error',
      channels: ['discord'],
    }
  }

  const admin_support_presence_lifecycle = new Set([
    'admin_presence_entered',
    'admin_presence_heartbeat',
    'admin_presence_timeout_checker_started',
    'admin_presence_timeout_checker_disabled',
    'admin_presence_timeout_checker_stopped',
    'admin_leave_heartbeat_timeout_detected',
    'admin_auto_leave_decision_started',
    'admin_auto_leave_decision_succeeded',
    'admin_auto_leave_decision_skipped',
    'admin_presence_leave_update_started',
    'admin_presence_leave_update_succeeded',
    'admin_presence_leave_update_failed',
    'admin_participant_presence_update_started',
    'admin_participant_presence_update_succeeded',
    'admin_participant_presence_update_failed',
    'support_left_duplicate_skipped',
    'support_started_duplicate_skipped',
    'support_started_trigger_detected',
    'support_started_existing_active_found',
    'support_lifecycle_owner_registered',
    'support_lifecycle_duplicate_owner_skipped',
    'admin_support_presence_started',
    'admin_support_presence_heartbeat',
    'admin_support_presence_left',
    'admin_support_presence_idle',
    'admin_support_joined',
    'admin_presence_joined',
    'admin_support_typing',
    'admin_support_left',
    'admin_support_idle',
    'admin_support_recovered',
  ])

  if (
    input.category === 'admin_chat' &&
    admin_support_presence_lifecycle.has(input.event)
  ) {
    return {
      category: 'admin_chat',
      level: 'info',
      channels: debug_control.admin_support_presence_debug_enabled
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

  const support_left_lifecycle = new Set([
    'admin_support_leave_detected',
    'leave_support_room_started',
    'leave_support_room_skipped',
    'leave_support_room_succeeded',
    'leave_support_room_failed',
    'support_left_action_create_started',
    'support_left_action_create_succeeded',
    'support_left_action_create_failed',
    'support_left_notify_started',
    'support_left_notify_succeeded',
    'support_left_notify_failed',
    'support_left_discord_send_started',
    'support_left_discord_send_succeeded',
    'support_left_discord_send_failed',
  ])

  if (
    input.category === 'admin_chat' &&
    support_left_lifecycle.has(input.event)
  ) {
    return {
      category: 'admin_chat',
      level: input.event.endsWith('_failed') ? 'error' : 'info',
      channels: debug_control.support_started_debug_enabled
        ? ['discord']
        : [],
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
    'pwa_guest_session_resolved',
    'pwa_user_restore_skipped_for_guest',
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
    'pwa_update_modal_started',
    'pwa_update_reload_started',
    'pwa_update_reload_completed',
    'pwa_update_reload_failed',
    'admin_notification_settings_rendered',
    'admin_notification_settings_saved',
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
    'presence_channel_detected',
    'notification_modal_opened',
    'notification_tab_changed',
    'push_toggle_clicked',
    'pwa_install_state_checked',
    'pwa_notification_toggle_disabled',
    'pwa_notification_toggle_nstalled',
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
    'notification_method_auto_adjust_started',
    'notification_method_auto_adjust_completed',
    'notification_method_invalid_both_off_prevented',
    'notification_setting_save_started',
    'notification_setting_save_succeeded',
    'notification_setting_save_failed',
    'notification_primary_channel_changed',
    'push_subscription_lookup_started',
    'push_subscription_lookup_result',
    'push_subscription_lookup_failed',
    'notify_push_preference_checked',
    'notify_push_subscription_checked',
    'notify_push_disabled_reason',
    'notify_push_send_started',
    'notify_push_sender_name_resolved',
    'notify_push_payload_built',
    'notify_line_last_channel_resolved',
    'notify_line_open_url_resolved',
    'notify_line_payload_built',
    'admin_notify_target_resolved',
    'notification_line_sent',
    'sw_push_received',
    'sw_notification_shown',
    'sw_notification_clicked',
    'sw_notifications_clear_requested',
    'sw_notifications_cleared',
    'line_message_received',
    'line_room_resolved',
    'line_participant_resolved',
    'line_message_bundle_built',
    'line_archive_started',
    'line_archive_succeeded',
    'line_archive_failed',
    'admin_realtime_message_insert_seen',
    'chat_auto_reply_rule_checked',
    'chat_auto_reply_skipped',
    'concierge_mode_detected',
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
      channels:
        is_failed ||
        input.event === 'presence_channel_detected' ||
        debug_control.debug_full
          ? ['discord']
          : [],
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
      input.event === 'chat_message_send_failed' ||
      input.event === 'output_reply_delivery_failed'

    return {
      category: 'chat_message',
      level: is_failed ? 'error' : 'info',
      channels: is_failed ? ['discord'] : [],
    }
  }

  const chat_realtime_always_discord = new Set([
    'message_realtime_mounted',
    'message_realtime_subscribe_started',
    'message_realtime_subscribe_status',
    'message_realtime_payload_received',
    'message_realtime_payload_accepted',
    'message_realtime_payload_ignored',
    'message_realtime_rendered',
    'typing_realtime_mounted',
    'typing_realtime_subscribe_started',
    'typing_realtime_subscribe_status',
    'typing_status_sent',
    'staff_typing_status_send_started',
    'staff_typing_status_sent',
    'staff_typing_status_stopped',
    'staff_typing_status_send_failed',
    'staff_typing_realtime_mounted',
    'user_typing_status_received',
    'staff_typing_realtime_payload_received',
    'staff_typing_realtime_payload_accepted',
    'staff_typing_realtime_rendered',
    'staff_typing_realtime_ignored',
    'staff_typing_realtime_expired',
    'typing_realtime_payload_received',
    'typing_realtime_payload_accepted',
    'typing_realtime_rendered',
    'typing_realtime_expired',
    'typing_realtime_payload_ignored',
    'action_realtime_mounted',
    'action_realtime_subscribe_started',
    'action_realtime_subscribe_status',
    'action_realtime_payload_received',
    'action_realtime_payload_accepted',
    'action_realtime_payload_ignored',
    'action_realtime_rendered',
    'chat_realtime_hook_mounted',
    'chat_realtime_subscribe_started',
    'chat_realtime_subscribe_status',
    'chat_realtime_message_received',
    'chat_realtime_message_accepted',
    'chat_realtime_message_ignored',
    'chat_realtime_message_rendered',
    'chat_typing_started',
    'chat_typing_stopped',
    'chat_typing_realtime_received',
    'chat_typing_realtime_rendered',
    'chat_typing_expired',
    'chat_realtime_action_received',
    'chat_realtime_action_accepted',
    'chat_realtime_action_ignored',
    'chat_realtime_state_append_succeeded',
    'chat_realtime_subscribe_failed',
    'chat_realtime_message_callback_ignored',
    'chat_realtime_typing_callback_ignored',
    'chat_realtime_action_callback_ignored',
    'chat_realtime_cleanup_started',
    'chat_realtime_cleanup_completed',
    'chat_typing_broadcast_failed',
    'chat_typing_listener_not_registered',
    'chat_typing_send_before_subscribed',
    'admin_realtime_client_mounted',
    'admin_realtime_client_room_ready',
    'admin_realtime_client_subscribe_started',
    'admin_realtime_client_subscribe_status',
    'admin_realtime_client_payload_received',
    'admin_realtime_client_payload_accepted',
    'admin_realtime_client_payload_ignored',
    'admin_active_chat_realtime_payload_received',
    'admin_active_chat_realtime_payload_accepted',
    'admin_active_chat_realtime_payload_ignored',
    'admin_realtime_client_state_append_started',
    'admin_realtime_client_state_append_succeeded',
    'admin_realtime_client_state_append_failed',
    'user_realtime_client_subscribe_started',
    'user_realtime_client_subscribe_status',
    'user_realtime_client_payload_received',
    'user_realtime_client_payload_accepted',
    'user_realtime_client_payload_ignored',
    'user_realtime_client_state_append_succeeded',
    'admin_notification_archive_hook_started',
    'admin_notification_rule_checked',
    'admin_line_notification_rule_checked',
    'admin_notification_candidate_checked',
    'admin_notification_active_state_checked',
    'admin_notification_skipped_receiver_active_in_app',
    'admin_line_notification_skipped_receiver_active_in_app',
    'admin_notification_skipped_offline',
    'admin_notification_skipped_header_off',
    'admin_line_notification_skipped_header_off',
    'admin_line_notification_skipped_chat_off',
    'admin_line_notification_skipped_line_off',
    'admin_notification_method_resolved',
    'admin_push_send_started',
    'admin_push_send_succeeded',
    'admin_push_send_failed',
    'admin_line_notification_send_started',
    'admin_line_notification_send_succeeded',
    'admin_line_notification_send_failed',
    'admin_line_send_started',
    'admin_line_send_succeeded',
    'admin_line_send_failed',
    'admin_discord_fallback_started',
    'admin_push_skipped_active_in_room',
    'admin_realtime_client_support_action_merged',
    'admin_support_action_received',
    'admin_support_action_rendered',
    'admin_support_action_ignored',
    'chat_action_realtime_ignored',
    'support_left_realtime_received',
    'support_left_realtime_rendered',
    'support_left_realtime_ignored',
    'support_action_realtime_subscribe_started',
    'support_action_realtime_payload_received',
    'support_action_realtime_rendered',
    'support_action_realtime_ignored',
    'support_action_duplicate_skipped',
    'timeline_item_duplicate_skipped',
    'support_started_realtime_rendered',
    'admin_chat_room_rendered',
    'admin_chat_room_mounted',
    'admin_chat_mounted',
    'admin_chat_room_ready',
    'admin_chat_room_enter_started',
    'admin_chat_room_enter_succeeded',
    'admin_chat_room_enter_failed',
    'admin_chat_component_rendered',
    'admin_chat_detail_mounted',
    'admin_chat_detail_unmounted',
    'admin_chat_useeffect_triggered',
    'admin_chat_useeffect_skipped_no_room',
    'admin_chat_useeffect_skipped_no_admin',
    'admin_chat_useeffect_skipped_already_active',
    'admin_chat_cleanup_started',
    'admin_active_room_ready',
    'admin_support_enter_invocation_started',
    'admin_support_enter_invocation_succeeded',
    'admin_support_enter_invocation_failed',
    'admin_support_leave_invocation_started',
    'admin_support_leave_invocation_succeeded',
    'admin_support_leave_invocation_failed',
    'admin_support_enter_call_started',
    'admin_support_enter_call_succeeded',
    'admin_support_enter_call_failed',
    'admin_support_leave_call_started',
    'admin_support_leave_call_succeeded',
    'admin_support_leave_call_failed',
    'admin_leave_route_change_detected',
    'admin_leave_room_change_detected',
    'admin_leave_visibility_hidden_detected',
    'admin_leave_pagehide_detected',
    'admin_leave_beforeunload_detected',
    'admin_top_chat_action_received',
    'admin_top_chat_action_accepted',
    'admin_top_chat_action_ignored',
    'admin_top_room_card_updated_from_action',
    'admin_top_room_cards_sorted',
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
    'admin_realtime_payload_received',
    'admin_realtime_payload_accepted',
    'admin_realtime_payload_ignored',
    'chat_messages_normalize_started',
    'chat_messages_sorted',
    'realtime_message_merge_started',
    'realtime_message_merge_succeeded',
    'room_unread_realtime_received',
    'admin_room_badge_updated',
    'admin_presence_subscribe_started',
    'admin_presence_realtime_received',
    'admin_presence_payload_accepted',
    'admin_presence_payload_ignored',
    'admin_room_typing_state_updated',
    'admin_support_presence_realtime_received',
    'admin_support_status_updated',
    'admin_support_recovered',
    'admin_support_presence_idle',
    'admin_room_list_realtime_subscribe_started',
    'admin_room_list_message_received',
    'admin_room_list_message_accepted',
    'admin_room_card_state_updated',
    'admin_room_card_resorted',
    'admin_realtime_client_subscribe_started',
    'admin_realtime_client_payload_received',
    'admin_realtime_client_payload_accepted',
    'admin_active_chat_realtime_payload_received',
    'admin_active_chat_realtime_payload_accepted',
    'admin_realtime_client_subscribe_status',
    'admin_realtime_client_state_append_started',
    'admin_realtime_client_state_append_succeeded',
    'user_realtime_client_subscribe_started',
    'user_realtime_client_subscribe_status',
    'user_realtime_client_payload_received',
    'user_realtime_client_payload_accepted',
    'user_realtime_client_state_append_succeeded',
    'admin_support_action_received',
    'admin_support_action_rendered',
    'chat_action_realtime_subscribe_started',
    'chat_action_realtime_subscribe_status',
    'chat_action_realtime_received',
    'chat_action_realtime_accepted',
    'chat_action_realtime_rendered',
    'chat_action_realtime_cleanup_started',
    'support_action_realtime_subscribe_started',
    'support_action_realtime_payload_received',
    'support_action_realtime_rendered',
    'support_action_realtime_ignored',
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
    const keep_notify_debug =
      input.event === 'admin_notification_rule_checked' ||
      input.event === 'admin_notification_skipped_receiver_active_in_app'

    return {
      category: 'chat_realtime',
      level: is_error ? 'error' : 'warn',
      channels:
        is_error || keep_notify_debug || debug_control.debug_full
          ? ['discord']
          : [],
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

  const chat_realtime_presence_user_events = new Set([
    'presence_typing_started',
    'presence_typing_heartbeat',
    'presence_typing_stopped',
  ])

  if (
    input.category === 'chat_realtime' &&
    chat_realtime_presence_user_events.has(input.event)
  ) {
    return {
      category: 'chat_realtime',
      level: 'info',
      channels: debug_control.chat_realtime_debug_enabled
        ? ['discord']
        : [],
    }
  }

  if (input.category === 'chat_realtime') {
    return {
      category: 'chat_realtime',
      level: 'info',
      channels: [],
    }
  }

  return {
    category: input.category,
    level: 'info',
    channels: ['discord'],
  }
}
