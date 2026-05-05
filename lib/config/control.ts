export const control = {
  debug: {
    /** Session API route (`app/api/session/route.ts`) verbose block. */
    session_route: true,
    visitor_context: false,
    /** Core session/cookie `debug_event` emissions from `lib/auth/session.ts`. */
    session_core: true,
    chat_room: false,
    identity_promotion: false,

    line_auth: false,
    liff_auth: false,

    /**
     * Temporary: Discord receives only `category: 'session'` (shows as SESSION).
     * All other `debug` / `debug_event` categories are dropped before send.
     */
    discord_debug_session_only: true,
  },

  notify: {
    new_user_created: false,
    /** Required for `debug_event` -> notify path; pairing with `discord_debug_session_only`. */
    debug_trace: true,
  },
} as const
