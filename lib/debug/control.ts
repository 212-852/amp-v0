import 'server-only'

export const debug_control = {
  handoff_memo_debug_enabled: false,
  admin_management_debug_enabled: false,
  chat_message_debug_enabled: false,
  /** Success-path Discord traces for chat realtime (subscribe ok, message received, typing ok). */
  chat_realtime_debug_enabled: false,
} as const
