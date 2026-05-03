export const control = {
  debug: {
    session_route: false,
    visitor_context: false,

    line_auth: true,
    liff_auth: true,
  },

  notify: {
    new_user_created: true,
  },
} as const