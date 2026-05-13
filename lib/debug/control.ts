import 'server-only'

export const debug_control = {
  handoff_memo_debug_enabled: false,
  admin_management_debug_enabled: false,
  /** Emits concierge_room_* list traces to Discord (debug webhook). */
  admin_chat_room_list_debug_enabled: false,
  /** Emits gated support_started lifecycle traces to Discord (debug webhook). */
  support_started_debug_enabled: false,
  chat_message_debug_enabled: false,
  /** Success-path Discord traces for chat realtime (subscribe ok, message received, typing ok). */
  chat_realtime_debug_enabled: false,
  /** Extra noisy realtime traces used only while diagnosing live sync. */
  realtime_verbose_debug_enabled: false,
} as const
