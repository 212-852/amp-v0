export const control = {
  debug: {
    /** Session API route (`app/api/session/route.ts`) verbose block. */
    session_route: false,
    visitor_context: false,
    /** Core session/cookie `debug_event` emissions from `lib/auth/session.ts`. */
    session_core: true,
    chat_room: false,
    locale: false,
    identity: true,
    line: false,
    /** Temporary: LINE Messaging webhook trace (see `app/api/webhook/line/route.ts`). */
    line_webhook: true,
    identity_promotion: false,

    line_auth: true,
    liff_auth: true,

    /**
     * Temporary LINE flow trace: when true, only `discord_category_allowlist` reaches Discord.
     */
    use_discord_category_allowlist: true,
    discord_category_allowlist: [
      'session',
      'liff',
      'identity',
      'line_webhook',
    ],
  },

  notify: {
    new_user_created: true,
    /** Required for `debug_event` -> notify path. */
    debug_trace: true,
  },
} as const
