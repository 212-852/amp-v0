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
  level?: 'info' | 'warn' | 'error'
  subscribe_status?: string | null
  message_uuid?: string | null
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
      subscribe_status: input.subscribe_status ?? null,
      message_uuid: input.message_uuid ?? null,
      filter: input.filter ?? null,
      phase: input.phase ?? null,
    }),
  }).catch(() => {})
}
