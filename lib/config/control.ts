export const control = {
  debug: {
    session_route: false,
    visitor_context: false,
    session_core: true,
    chat_room: true,
    identity_promotion: true,

    line_auth: true,
    liff_auth: true,
  },

  notify: {
    new_user_created: true,
    debug_trace: true,
  },
} as const