'use client'

/**
 * Admin reception/chat lifecycle traces -> POST /api/debug/chat -> debug_event -> notify -> Discord.
 * Do not call Discord webhooks from UI.
 */
export function send_admin_chat_debug(input: {
  event: string
  room_uuid?: string | null
  active_room_uuid?: string | null
  admin_user_uuid?: string | null
  admin_participant_uuid?: string | null
  component_file?: string | null
  pathname?: string | null
  ignored_reason?: string | null
  error_code?: string | null
  error_message?: string | null
  error_details?: string | null
  error_hint?: string | null
  error_json?: string | null
  admin_user_uuid_exists?: boolean
  admin_participant_uuid_exists?: boolean
  level?: 'info' | 'warn' | 'error'
  subscribe_status?: string | null
  message_uuid?: string | null
  action_uuid?: string | null
  support_session_key?: string | null
  existing_left_action_uuid?: string | null
  leave_reason?: string | null
  filter?: string | null
  phase?: string | null
}) {
  const pathname =
    input.pathname ??
    (typeof window !== 'undefined' ? window.location.pathname : null)

  void fetch('/api/debug/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      category: 'admin_chat',
      level: input.level ?? 'info',
      event: input.event,
      room_uuid: input.room_uuid ?? null,
      active_room_uuid: input.active_room_uuid ?? input.room_uuid ?? null,
      admin_user_uuid: input.admin_user_uuid ?? null,
      admin_participant_uuid: input.admin_participant_uuid ?? null,
      component_file: input.component_file ?? null,
      pathname,
      ignored_reason: input.ignored_reason ?? null,
      error_code: input.error_code ?? null,
      error_message: input.error_message ?? null,
      error_details: input.error_details ?? null,
      error_hint: input.error_hint ?? null,
      error_json: input.error_json ?? null,
      admin_user_uuid_exists:
        typeof input.admin_user_uuid_exists === 'boolean'
          ? input.admin_user_uuid_exists
          : null,
      admin_participant_uuid_exists:
        typeof input.admin_participant_uuid_exists === 'boolean'
          ? input.admin_participant_uuid_exists
          : null,
      subscribe_status: input.subscribe_status ?? null,
      message_uuid: input.message_uuid ?? null,
      action_uuid: input.action_uuid ?? null,
      support_session_key: input.support_session_key ?? null,
      existing_left_action_uuid: input.existing_left_action_uuid ?? null,
      leave_reason: input.leave_reason ?? null,
      filter: input.filter ?? null,
      phase: input.phase ?? null,
    }),
  }).catch(() => {})
}
