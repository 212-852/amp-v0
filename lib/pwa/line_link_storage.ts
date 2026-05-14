'use client'

/** Cleared after successful LINE link poll or session refresh. */
export const pwa_line_link_failed_local_key = 'amp_pwa_line_link_failed'

export const pwa_line_link_failed_session_key = 'amp_pwa_line_link_failed_session'

export function clear_pwa_line_link_error_flags() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.removeItem(pwa_line_link_failed_session_key)
    window.localStorage.removeItem(pwa_line_link_failed_local_key)
  } catch {
    /* ignore */
  }
}

export function set_pwa_line_link_failed_flags() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(pwa_line_link_failed_session_key, '1')
    window.localStorage.setItem(pwa_line_link_failed_local_key, '1')
  } catch {
    /* ignore */
  }
}
