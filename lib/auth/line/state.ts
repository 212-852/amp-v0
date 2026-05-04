const uuid_pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function is_browser_visitor_uuid(value: string | null | undefined) {
  if (!value) {
    return false
  }

  return uuid_pattern.test(value)
}

/**
 * LINE OAuth state cookie and authorize `state` param (must match byte-for-byte).
 * Optional `:${visitor_uuid}` suffix survives cross-context redirects when the
 * visitor cookie is missing on the callback request.
 */
export function build_line_login_oauth_state(browser_visitor_uuid: string | null) {
  const csrf = globalThis.crypto.randomUUID()

  if (is_browser_visitor_uuid(browser_visitor_uuid)) {
    return `${csrf}:${browser_visitor_uuid}`
  }

  return csrf
}

export function parse_line_login_oauth_state(state: string): {
  csrf_token: string
  browser_visitor_uuid: string | null
} {
  const colon = state.indexOf(':')

  if (colon === -1) {
    return {
      csrf_token: state,
      browser_visitor_uuid: null,
    }
  }

  const csrf_token = state.slice(0, colon)
  const suffix = state.slice(colon + 1)

  if (!is_browser_visitor_uuid(suffix)) {
    return {
      csrf_token: state,
      browser_visitor_uuid: null,
    }
  }

  return {
    csrf_token,
    browser_visitor_uuid: suffix,
  }
}
