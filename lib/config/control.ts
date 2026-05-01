export const control = {
  debug: {
    session_route: true,
    visitor_context: true,
    line_auth: true,
    liff_auth: true,
  },
  notify: {
    new_user_created: true,
  },
} as const
