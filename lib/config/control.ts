export const control = {
  debug: {
    /** Session API route (`app/api/session/route.ts`) verbose block. */
    session_route: false,
    visitor_context: false,
    /** Core session/cookie `debug_event` emissions from `lib/auth/session.ts`. */
    session_core: false,
    chat_room: false,
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
    ],
  },

  notify: {
    new_user_created: true,
    concierge_room_request: true,
    /** Required for `debug_event` -> notify path. */
    debug_trace: true,
  },
} as const
