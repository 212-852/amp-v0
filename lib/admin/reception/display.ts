import {
  admin_support_tier_from_row,
  typing_timestamp_is_fresh,
  type admin_support_staff_row,
} from '@/lib/chat/presence/rules'

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
  latest_activity_at?: string | null
  user_participant_uuid?: string | null
  user_is_typing?: boolean
  user_is_online?: boolean
  user_last_seen_at?: string | null
  presence_source_channel?: string | null
  /** Latest `typing_at` from customer participant; used to expire typing UI locally. */
  user_typing_at?: string | null
  admin_support_staff?: admin_support_staff_row[]
  admin_support_card_line?: string
  admin_support_active_header_line?: string
  admin_support_last_handled_label?: string
}

export type room_card_summary_type =
  | 'user_typing'
  | 'admin_active'
  | 'admin_idle'
  | 'latest_message'
  | 'none'

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
    return 'ユーザー入力中'
  }

  return ''
}

export function build_room_card_summary(input: {
  latest_message_text?: string | null
  user_is_typing?: boolean | null
  user_typing_at?: string | null
  admin_support_staff?: admin_support_staff_row[] | null
  now?: Date
}): {
  summary_type: room_card_summary_type
  summary_text: string
  active_admin_count: number
  typing_exists: boolean
} {
  const now = input.now ?? new Date()
  const staff = input.admin_support_staff ?? []
  const with_tier = staff
    .map((row) => ({
      row,
      tier: admin_support_tier_from_row(row, now),
    }))
    .filter((item) => item.tier !== 'left')
  const active_admin_count = with_tier.filter(
    (item) => item.tier === 'typing' || item.tier === 'active',
  ).length
  const typing_exists = typing_timestamp_is_fresh(
    input.user_typing_at ?? null,
    input.user_is_typing ?? null,
    now,
  )

  if (typing_exists) {
    return {
      summary_type: 'user_typing',
      summary_text: 'ユーザー入力中...',
      active_admin_count,
      typing_exists: true,
    }
  }

  const active = with_tier.find(
    (item) => item.tier === 'typing' || item.tier === 'active',
  )

  if (active) {
    return {
      summary_type: 'admin_active',
      summary_text: `${active.row.display_name} 対応中`,
      active_admin_count,
      typing_exists: false,
    }
  }

  const idle = with_tier.find((item) => item.tier === 'idle')

  if (idle) {
    return {
      summary_type: 'admin_idle',
      summary_text: `${idle.row.display_name} 退出`,
      active_admin_count: 0,
      typing_exists: false,
    }
  }

  const latest = input.latest_message_text?.trim() ?? ''

  if (latest) {
    return {
      summary_type: 'latest_message',
      summary_text: latest,
      active_admin_count: 0,
      typing_exists: false,
    }
  }

  return {
    summary_type: 'none',
    summary_text: '',
    active_admin_count: 0,
    typing_exists: false,
  }
}
