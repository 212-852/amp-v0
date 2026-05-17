'use client'

export function send_driver_link_debug(input: {
  event:
    | 'driver_entry_cta_clicked'
    | 'driver_apply_access_checked'
    | 'line_link_redirect_resolved'
    | 'line_link_failed'
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  has_line_identity?: boolean | null
  return_path?: string | null
  next_url?: string | null
  allowed?: boolean | null
  redirect_to?: string | null
  reason?: string | null
  role_route?: string | null
  selected_redirect?: string | null
  redirect_reason?: string | null
  error_code?: string | null
  error_message?: string | null
}) {
  void fetch('/api/debug/driver', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}
