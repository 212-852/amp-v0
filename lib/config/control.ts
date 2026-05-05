export const control = {
  debug: {
    /** Session API route (`app/api/session/route.ts`) verbose block. */
    session_route: false,
    visitor_context: false,
    /** Core session/cookie `debug_event` emissions from `lib/auth/session.ts`. */
    session_core: true,
    chat_room: false,
    identity_promotion: false,

    line_auth: true,
    liff_auth: false,

    /**
     * Temporary LINE flow trace: when true, only `discord_category_allowlist` reaches Discord.
     */
    use_discord_category_allowlist: true,
    discord_category_allowlist: [
      'session',
      'line',
      'line_webhook',
      'locale',
      'identity',
      'chat_room',
    ],
  },

  notify: {
    new_user_created: false,
    /** Required for `debug_event` -> notify path. */
    debug_trace: true,
  },
} as const
