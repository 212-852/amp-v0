export const control = {
  debug: {
    /** Session API route (`app/api/session/route.ts`) verbose block. */
    session_route: false,
    visitor_context: false,
    /** Core session/cookie `debug_event` emissions from `lib/auth/session.ts`. */
    session_core: false,
    chat_room: false,
    /** When true, success-path `chat_realtime_*` Discord traces are allowed (failures still use rules). */
    chat_realtime: false,
    locale: false,
    identity: false,
    line: false,
    /** Temporary: LINE Messaging webhook trace (see `app/api/webhook/line/route.ts`). */
    line_webhook: false,
    identity_promotion: false,

    line_auth: false,
    liff_auth: false,
    auth_route: false,
    user_page: false,

    /**
     * Temporary LINE flow trace: when true, only `discord_category_allowlist` reaches Discord.
     */
    use_discord_category_allowlist: true,
    discord_category_allowlist: [
      'liff',
      'line_webhook',
      'handoff_memo',
      'admin_management',
      'admin_chat',
      'chat_message',
      'chat_realtime',
      'pwa',
      'notification',
    ],
  },

  notify: {
    new_user_created: true,
    concierge_room_request: true,
    /** Required for `debug_event` -> notify path. */
    debug_trace: true,
    support_started: true,
  },
} as const
