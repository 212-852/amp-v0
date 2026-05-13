export const visitor_cookie_name = 'amp_visitor_uuid'
export const visitor_local_storage_key = 'amp_visitor_uuid'
export const client_visitor_header_name = 'x-amp-client-visitor-uuid'
export const client_source_channel_header_name = 'x-amp-source-channel'
export const client_display_mode_header_name = 'x-amp-display-mode'

/**
 * Set by middleware on the forwarded request only (client-supplied values removed).
 * Same value as the visitor cookie when present, so RSC/API can read the UUID on the
 * first response when cookies() does not yet expose the new cookie.
 */
export const resolved_visitor_request_header_name =
  'x-amp-resolved-visitor-uuid'

/** Set to `liff` after successful `POST /api/auth/line/liff` (LIFF id_token linked). */
export const browser_channel_cookie_name = 'amp_browser_channel'
