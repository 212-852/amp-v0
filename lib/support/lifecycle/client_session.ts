'use client'

const storage_prefix = 'amp_admin_support_client_session'

export function get_or_create_admin_support_client_session_id(): string {
  if (typeof window === 'undefined') {
    return 'server'
  }

  const key = `${storage_prefix}:global`
  const existing = window.sessionStorage.getItem(key)

  if (existing && existing.trim()) {
    return existing.trim()
  }

  const created =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  window.sessionStorage.setItem(key, created)

  return created
}
