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
  unread_count?: number
  user_participant_uuid?: string | null
  user_is_typing?: boolean
  user_is_online?: boolean
  user_last_seen_at?: string | null
  presence_source_channel?: string | null
  /** Latest `typing_at` from customer participant; used to expire typing UI locally. */
  user_typing_at?: string | null
}

export function format_admin_room_unread_label(count: number): string {
  if (!Number.isFinite(count) || count <= 0) {
    return '0'
  }

  if (count >= 10) {
    return '9+'
  }

  return String(Math.floor(count))
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

export function reception_presence_label(input: {
  is_typing?: boolean | null
  is_online?: boolean | null
  last_seen_at?: string | null
}) {
  if (input.is_typing === true) {
    return '入力中...'
  }

  if (input.is_online === true) {
    return 'オンライン'
  }

  if (!input.last_seen_at) {
    return '最終 --:--'
  }

  const date = new Date(input.last_seen_at)

  if (Number.isNaN(date.getTime())) {
    return '最終 --:--'
  }

  return `最終 ${date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}
