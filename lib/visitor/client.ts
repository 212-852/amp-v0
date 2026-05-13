'use client'

import {
  client_display_mode_header_name,
  client_source_channel_header_name,
  client_visitor_header_name,
  visitor_local_storage_key,
} from '@/lib/visitor/cookie'

function is_uuid(value: string | null): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  )
}

export function read_local_visitor_uuid(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const value = window.localStorage.getItem(visitor_local_storage_key)

  return is_uuid(value) ? value : null
}

export function write_local_visitor_uuid(visitor_uuid: string | null) {
  if (typeof window === 'undefined' || !is_uuid(visitor_uuid)) {
    return
  }

  window.localStorage.setItem(visitor_local_storage_key, visitor_uuid)
}

export function is_standalone_display_mode() {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  )
}

export function build_session_restore_headers(): HeadersInit {
  const headers: Record<string, string> = {}
  const visitor_uuid = read_local_visitor_uuid()
  const standalone = is_standalone_display_mode()

  if (visitor_uuid) {
    headers[client_visitor_header_name] = visitor_uuid
  }

  headers[client_source_channel_header_name] = standalone ? 'pwa' : 'web'
  headers[client_display_mode_header_name] = standalone
    ? 'standalone'
    : 'browser'

  return headers
}
