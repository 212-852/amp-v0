export type reception_room = {
  room_uuid: string
  display_name: string
  role: string | null
  tier: string | null
  avatar_url: string | null
  title: string
  preview: string
  updated_at: string | null
  mode: string | null
  last_incoming_channel: string | null
}

export function normalize_reception_channel(value: unknown): string | null {
  if (value === 'line' || value === 'liff' || value === 'pwa' || value === 'web') {
    return value
  }

  return null
}

export function reception_channel_label(value: string | null | undefined) {
  const normalized = normalize_reception_channel(value)

  if (normalized === 'line') {
    return 'LINE'
  }

  if (normalized === 'liff') {
    return 'LIFF'
  }

  if (normalized === 'pwa') {
    return 'PWA'
  }

  if (normalized === 'web') {
    return 'Web'
  }

  return 'Web'
}
