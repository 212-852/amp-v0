export const typing_timeout_ms = 5_000

/** Admin staff "in room" recency for support UI (participants.last_seen_at). */
export const admin_support_active_within_ms = 45_000
export const admin_support_idle_within_ms = 120_000

export type participant_surface_channel = 'web' | 'pwa' | 'liff' | 'line' | 'admin'

export function normalize_participant_surface_channel(
  raw: unknown,
): participant_surface_channel | null {
  if (typeof raw !== 'string') {
    return null
  }

  const t = raw.trim().toLowerCase()

  if (t === 'web' || t === 'pwa' || t === 'liff' || t === 'line' || t === 'admin') {
    return t
  }

  return null
}

export type participant_role =
  | 'user'
  | 'driver'
  | 'admin'
  | 'concierge'
  | 'bot'

export type presence_participant = {
  participant_uuid: string
  display_name: string | null
  avatar_url: string | null
  role: participant_role
  is_active: boolean
  is_typing: boolean
  last_seen_at: string | null
  typing_at: string | null
}

export type visible_presence_participant = {
  participant_uuid: string
  display_name: string
  avatar_url: string | null
  role: participant_role
}

export type reception_room_card = {
  room_uuid: string
  display_name: string | null
  avatar_url: string | null
  latest_message_text: string | null
  latest_message_at: string | null
  typing_participants: visible_presence_participant[]
  active_participants: visible_presence_participant[]
}

export function is_participant_role(value: unknown): value is participant_role {
  return (
    value === 'user' ||
    value === 'driver' ||
    value === 'admin' ||
    value === 'concierge' ||
    value === 'bot'
  )
}

function participant_display_name(participant: presence_participant) {
  const name = participant.display_name?.trim()

  if (name) {
    return name
  }

  if (participant.role === 'user') {
    return 'Guest'
  }

  return participant.role
}

function to_visible_participant(
  participant: presence_participant,
): visible_presence_participant {
  return {
    participant_uuid: participant.participant_uuid,
    display_name: participant_display_name(participant),
    avatar_url: participant.avatar_url,
    role: participant.role,
  }
}

export function typing_timestamp_is_fresh(
  typing_at: string | null,
  is_typing: boolean | null,
  now: Date,
) {
  if (is_typing !== true || !typing_at) {
    return false
  }

  const typed_at = new Date(typing_at).getTime()

  if (Number.isNaN(typed_at)) {
    return false
  }

  return now.getTime() - typed_at <= typing_timeout_ms
}

function typing_is_fresh(
  participant: presence_participant,
  now: Date,
) {
  return typing_timestamp_is_fresh(
    participant.typing_at,
    participant.is_typing,
    now,
  )
}

export type chat_room_list_preview_audience = 'admin_inbox' | 'user_home'

/**
 * Single resolver for chat list / HOME preview: typing overrides latest text.
 */
export function resolve_chat_room_list_preview_text(input: {
  audience: chat_room_list_preview_audience
  latest_message_text: string | null
  typing_user_active: boolean
  typing_staff_lines: string[]
  typing_placeholder_ja: string
  fallback_when_empty: string
}): string {
  if (input.audience === 'user_home') {
    if (input.typing_staff_lines.length > 0) {
      return input.typing_placeholder_ja
    }
  } else {
    if (input.typing_user_active) {
      return input.typing_placeholder_ja
    }

    if (input.typing_staff_lines.length > 0) {
      return input.typing_staff_lines.join(' / ')
    }
  }

  const text = input.latest_message_text?.trim() ?? ''

  if (text.length > 0) {
    return text
  }

  return input.fallback_when_empty
}

export function decide_active_participants(
  participants: presence_participant[],
): visible_presence_participant[] {
  return participants
    .filter((participant) => participant.is_active)
    .map(to_visible_participant)
}

export function decide_typing_participants(
  participants: presence_participant[],
  now: Date,
): visible_presence_participant[] {
  return participants
    .filter((participant) => typing_is_fresh(participant, now))
    .map(to_visible_participant)
}

export type admin_support_tier = 'typing' | 'active' | 'idle' | 'left'

export type admin_support_staff_row = {
  participant_uuid: string
  user_uuid: string | null
  role: participant_role
  display_name: string
  last_seen_at: string | null
  typing_at: string | null
  is_typing: boolean
  is_active: boolean
}

export function admin_support_tier_from_row(
  row: admin_support_staff_row,
  now: Date,
): admin_support_tier {
  if (typing_timestamp_is_fresh(row.typing_at, row.is_typing, now)) {
    return 'typing'
  }

  const last = row.last_seen_at ? new Date(row.last_seen_at).getTime() : NaN

  if (Number.isNaN(last)) {
    return 'left'
  }

  const age = now.getTime() - last

  if (row.is_active === false) {
    return age <= admin_support_idle_within_ms ? 'idle' : 'left'
  }

  if (age <= admin_support_active_within_ms) {
    return 'active'
  }

  if (age <= admin_support_idle_within_ms) {
    return 'idle'
  }

  return 'left'
}

function tier_label_ja(tier: admin_support_tier) {
  if (tier === 'typing') {
    return '入力中'
  }

  if (tier === 'active') {
    return '対応中'
  }

  if (tier === 'idle') {
    return '離席中'
  }

  return ''
}

export function build_admin_support_ui_strings(input: {
  staff: admin_support_staff_row[]
  now: Date
}): {
  card_line: string
  active_header_line: string
  last_handled_label: string
} {
  const now = input.now
  const with_tier = input.staff.map((row) => ({
    row,
    tier: admin_support_tier_from_row(row, now),
  }))

  const order = (tier: admin_support_tier) =>
    tier === 'typing' ? 0 : tier === 'active' ? 1 : tier === 'idle' ? 2 : 3

  const visible = with_tier
    .filter((x) => x.tier !== 'left')
    .sort((a, b) => order(a.tier) - order(b.tier))

  const card_parts: string[] = []

  for (const { row, tier } of visible) {
    const label = tier_label_ja(tier)

    if (label) {
      card_parts.push(`${row.display_name} ${label}`)
    }
  }

  let last_ts = 0

  for (const { row } of with_tier) {
    const t = row.last_seen_at ? new Date(row.last_seen_at).getTime() : NaN

    if (!Number.isNaN(t) && t > last_ts) {
      last_ts = t
    }
  }

  const last_handled_label =
    last_ts > 0
      ? `最終対応 ${new Date(last_ts).toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}`
      : ''

  const active_names = with_tier
    .filter((x) => x.tier === 'active' || x.tier === 'typing')
    .map((x) => x.row.display_name)

  const active_header_line =
    active_names.length > 0
      ? `${active_names.join(', ')} が対応中`
      : ''

  const card_line =
    card_parts.length > 0
      ? `${card_parts.join(' / ')}${last_handled_label ? ` | ${last_handled_label}` : ''}`
      : ''

  return {
    card_line,
    active_header_line,
    last_handled_label,
  }
}

export function merge_admin_support_staff_from_presence(input: {
  staff: admin_support_staff_row[] | undefined
  presence: {
    participant_uuid: string
    user_uuid: string | null
    role: string | null
    is_active: boolean
    is_typing: boolean
    last_seen_at: string | null
    typing_at: string | null
  }
}): admin_support_staff_row[] {
  const role = input.presence.role?.trim().toLowerCase() ?? ''

  if (role !== 'admin' && role !== 'concierge') {
    return input.staff ?? []
  }

  const list = [...(input.staff ?? [])]
  const idx = list.findIndex(
    (s) => s.participant_uuid === input.presence.participant_uuid,
  )
  const role_raw = input.presence.role?.trim().toLowerCase() ?? ''
  const pr_role: participant_role =
    role_raw === 'concierge' ? 'concierge' : 'admin'
  const display_name =
    idx >= 0
      ? list[idx].display_name
      : pr_role === 'concierge'
        ? 'Concierge'
        : 'Admin'
  const row: admin_support_staff_row = {
    participant_uuid: input.presence.participant_uuid,
    user_uuid: input.presence.user_uuid,
    role: pr_role,
    display_name,
    last_seen_at: input.presence.last_seen_at,
    typing_at: input.presence.typing_at,
    is_typing: input.presence.is_typing,
    is_active: input.presence.is_active,
  }

  if (idx >= 0) {
    list[idx] = row
  } else {
    list.push(row)
  }

  return list
}

export function reception_room_refresh_admin_support_strings(input: {
  staff: admin_support_staff_row[] | undefined
  now: Date
}): {
  admin_support_staff: admin_support_staff_row[]
  admin_support_card_line: string
  admin_support_active_header_line: string
  admin_support_last_handled_label: string
} {
  const staff = input.staff ?? []
  const built = build_admin_support_ui_strings({
    staff,
    now: input.now,
  })

  return {
    admin_support_staff: staff,
    admin_support_card_line: built.card_line,
    admin_support_active_header_line: built.active_header_line,
    admin_support_last_handled_label: built.last_handled_label,
  }
}
