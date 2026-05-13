import 'server-only'

export type auth_link_provider = 'line'
export type auth_link_source_channel = 'pwa' | 'web' | 'liff' | 'line'
export type auth_link_status = 'pending' | 'completed' | 'expired' | 'failed'

const allowed_sources = new Set(['pwa', 'web', 'liff', 'line'])

export function normalize_link_provider(value: unknown): auth_link_provider {
  return value === 'line' ? 'line' : 'line'
}

export function normalize_link_source_channel(
  value: unknown,
): auth_link_source_channel {
  if (typeof value !== 'string') {
    return 'web'
  }

  const normalized = value.trim().toLowerCase()

  return allowed_sources.has(normalized)
    ? (normalized as auth_link_source_channel)
    : 'web'
}

export function normalize_link_status(
  value: unknown,
  expires_at?: string | null,
): auth_link_status {
  if (
    value === 'completed' ||
    value === 'expired' ||
    value === 'failed'
  ) {
    return value
  }

  if (expires_at && new Date(expires_at).getTime() <= Date.now()) {
    return 'expired'
  }

  return 'pending'
}

export function normalize_return_path(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null
  }

  return trimmed.slice(0, 512)
}

