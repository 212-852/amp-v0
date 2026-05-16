import type { archived_message } from './archive'
import type { message_bundle } from './message'

/**
 * Admin reception timeline row derived from the same `archived_message` source
 * as user WebChat (`load_archived_messages` / message bundles).
 */
export type chat_room_timeline_support_kind = 'support_started' | 'support_left'

export type timeline_item_kind = 'message' | 'action'

export type timeline_item_source = 'initial_fetch' | 'realtime'

export type chat_action_timeline_payload = {
  room_uuid: string
  action_uuid: string
  action_type: string
  body: string | null
  created_at: string | null
  actor_user_uuid: string | null
  actor_display_name: string | null
  source_channel: string | null
}

export const admin_timeline_chat_action_types = new Set([
  'support_started',
  'support_left',
  'concierge_enabled',
  'bot_enabled',
  'handoff',
  'internal_note_created',
])

export type chat_room_timeline_message = {
  message_uuid: string
  room_uuid: string
  direction: string | null
  sender: string | null
  role: string | null
  text: string
  created_at: string | null
  sequence: number | null
  bundle_type: string | null
  inserted_at?: string | null
  timeline_support_kind?: chat_room_timeline_support_kind | null
  timeline_source?: 'archive' | 'chat_actions'
  chat_action_uuid?: string | null
  timeline_item_kind?: timeline_item_kind
}

export type timeline_item = {
  kind: timeline_item_kind
  uuid: string
  room_uuid: string
  created_at: string | null
  source: timeline_item_source
  row: chat_room_timeline_message
}

export type timeline_item_duplicate_skip = {
  room_uuid: string
  item_key: string
  kind: timeline_item_kind
  uuid: string
  source: timeline_item_source
}

export function timeline_item_key(
  kind: timeline_item_kind,
  uuid: string,
): string {
  return `${kind}:${uuid.trim()}`
}

export function timeline_render_key(row: chat_room_timeline_message): string {
  const kind =
    row.timeline_item_kind ??
    (row.timeline_source === 'chat_actions' ? 'action' : 'message')
  const uuid =
    kind === 'action'
      ? (row.chat_action_uuid ?? row.message_uuid).trim()
      : row.message_uuid.trim()

  return timeline_item_key(kind, uuid)
}

export function parse_chat_action_timeline_row(
  value: unknown,
): chat_action_timeline_payload | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const row = value as Record<string, unknown>
  const room_uuid =
    typeof row.room_uuid === 'string' ? row.room_uuid.trim() : ''
  const action_type =
    typeof row.action_type === 'string' ? row.action_type.trim() : ''

  if (!room_uuid || !action_type) {
    return null
  }

  const action_uuid_raw =
    row.action_uuid ?? row.uuid ?? row.id ?? row.action_id
  const action_uuid =
    typeof action_uuid_raw === 'string' && action_uuid_raw.trim()
      ? action_uuid_raw.trim()
      : ''

  if (!action_uuid) {
    return null
  }

  const actor_user_uuid =
    typeof row.actor_user_uuid === 'string'
      ? row.actor_user_uuid
      : typeof row.admin_user_uuid === 'string'
        ? row.admin_user_uuid
        : null
  const actor_display_name =
    typeof row.actor_display_name === 'string'
      ? row.actor_display_name
      : null
  const source_channel =
    typeof row.source_channel === 'string' ? row.source_channel : null
  const body = typeof row.body === 'string' ? row.body : null
  const created_at =
    typeof row.created_at === 'string' ? row.created_at : null

  return {
    room_uuid,
    action_uuid,
    action_type,
    body,
    created_at,
    actor_user_uuid,
    actor_display_name,
    source_channel,
  }
}

export function is_admin_timeline_chat_action_type(
  action_type: string,
): boolean {
  return admin_timeline_chat_action_types.has(action_type.trim())
}

function timeline_text_from_bundle(bundle: message_bundle): string {
  switch (bundle.bundle_type) {
    case 'room_action_log':
      return bundle.payload.text?.trim() ?? ''
    case 'text':
      return bundle.payload.text?.trim() ?? ''
    case 'welcome':
      return [bundle.payload.title, bundle.payload.text]
        .filter((line) => line.trim().length > 0)
        .join('\n')
    case 'quick_menu':
      return bundle.payload.title?.trim() || bundle.bundle_type
    case 'how_to_use':
      return bundle.payload.title?.trim() || bundle.bundle_type
    case 'faq':
      return bundle.payload.title?.trim() || bundle.bundle_type
    case 'initial_carousel':
      return bundle.cards
        .map((card) => {
          if (card.bundle_type === 'quick_menu') {
            return card.payload.title
          }

          if (card.bundle_type === 'how_to_use') {
            return card.payload.title
          }

          if (card.bundle_type === 'faq') {
            return card.payload.title
          }

          return null
        })
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(' / ') || '[initial_carousel]'
    default: {
      const exhaustive: never = bundle

      void exhaustive

      return '(message)'
    }
  }
}

function archive_support_action_kind(
  bundle: message_bundle,
): chat_room_timeline_support_kind | null {
  if (bundle.bundle_type !== 'room_action_log') {
    return null
  }

  const meta =
    bundle.metadata &&
    typeof bundle.metadata === 'object' &&
    !Array.isArray(bundle.metadata)
      ? (bundle.metadata as Record<string, unknown>)
      : null
  const raw_action = meta?.action

  if (raw_action === 'support_started' || raw_action === 'support_left') {
    return raw_action
  }

  return null
}

/** Archived support lifecycle logs are rendered from `chat_actions` only. */
export function archive_support_action_log_for_chat_actions_table(
  row: chat_room_timeline_message,
): boolean {
  return (
    row.timeline_source !== 'chat_actions' &&
    (row.timeline_support_kind === 'support_started' ||
      row.timeline_support_kind === 'support_left')
  )
}

export function archived_message_to_timeline_message(
  row: archived_message,
): chat_room_timeline_message {
  const bundle = row.bundle

  if (bundle.bundle_type === 'room_action_log') {
    const actor =
      bundle.metadata &&
      typeof bundle.metadata.actor_display_name === 'string'
        ? bundle.metadata.actor_display_name.trim() || 'action'
        : 'action'

    const timeline_support_kind = archive_support_action_kind(bundle)
    const meta =
      bundle.metadata &&
      typeof bundle.metadata === 'object' &&
      !Array.isArray(bundle.metadata)
        ? (bundle.metadata as Record<string, unknown>)
        : null
    const chat_action_uuid_raw = meta?.chat_action_uuid
    const chat_action_uuid =
      typeof chat_action_uuid_raw === 'string' && chat_action_uuid_raw.trim()
        ? chat_action_uuid_raw.trim()
        : null

    return {
      message_uuid: row.archive_uuid,
      room_uuid: row.room_uuid,
      direction: 'system',
      sender: 'system',
      role: actor,
      text: timeline_text_from_bundle(bundle),
      created_at: row.created_at,
      sequence: row.sequence,
      bundle_type: bundle.bundle_type,
      inserted_at: row.inserted_at ?? null,
      timeline_support_kind,
      timeline_source: 'archive',
      chat_action_uuid,
      timeline_item_kind: 'message',
    }
  }

  const sender = bundle.sender
  const direction = sender === 'user' ? 'incoming' : 'outgoing'
  const role =
    bundle.bundle_type === 'text' &&
    bundle.metadata &&
    typeof bundle.metadata.sender_display_name === 'string'
      ? bundle.metadata.sender_display_name.trim() || sender
      : sender

  return {
    message_uuid: row.archive_uuid,
    room_uuid: row.room_uuid,
    direction,
    sender,
    role,
    text: timeline_text_from_bundle(bundle),
    created_at: row.created_at,
    sequence: row.sequence,
    bundle_type: bundle.bundle_type,
    inserted_at: row.inserted_at ?? null,
    timeline_support_kind: null,
    timeline_source: 'archive',
    chat_action_uuid: null,
    timeline_item_kind: 'message',
  }
}

export function chat_action_timeline_text(
  action: chat_action_timeline_payload,
): string {
  const body = action.body?.trim()

  if (body) {
    return body
  }

  const name = action.actor_display_name?.trim() || 'Admin'

  switch (action.action_type) {
    case 'support_started':
      return `${name} が対応を開始しました`
    case 'support_left':
      return `${name} が退出しました`
    case 'concierge_enabled':
      return 'コンシェルジュ対応に切り替えました'
    case 'bot_enabled':
      return 'ボット対応に切り替えました'
    case 'handoff':
      return '引き継ぎが記録されました'
    case 'internal_note_created':
      return '内部メモが追加されました'
    default:
      return action.action_type
  }
}

export function chat_action_to_admin_timeline_row(
  action: chat_action_timeline_payload,
): chat_room_timeline_message {
  const timeline_support_kind: chat_room_timeline_support_kind | null =
    action.action_type === 'support_started' ||
    action.action_type === 'support_left'
      ? action.action_type
      : null

  return {
    message_uuid: action.action_uuid,
    room_uuid: action.room_uuid,
    sequence: null,
    text: chat_action_timeline_text(action),
    created_at: action.created_at ?? new Date().toISOString(),
    direction: 'system',
    sender: 'system',
    role: 'system',
    bundle_type: 'room_action_log',
    timeline_support_kind,
    timeline_source: 'chat_actions',
    chat_action_uuid: action.action_uuid,
    timeline_item_kind: 'action',
  }
}

export function timeline_item_from_message_row(
  row: chat_room_timeline_message,
  source: timeline_item_source,
): timeline_item | null {
  if (archive_support_action_log_for_chat_actions_table(row)) {
    return null
  }

  const uuid = row.message_uuid.trim()

  if (!uuid) {
    return null
  }

  return {
    kind: 'message',
    uuid,
    room_uuid: row.room_uuid,
    created_at: row.created_at,
    source,
    row: {
      ...row,
      timeline_item_kind: 'message',
    },
  }
}

export function timeline_item_from_action(
  action: chat_action_timeline_payload,
  source: timeline_item_source,
): timeline_item {
  const uuid = action.action_uuid.trim()

  return {
    kind: 'action',
    uuid,
    room_uuid: action.room_uuid,
    created_at: action.created_at,
    source,
    row: chat_action_to_admin_timeline_row(action),
  }
}

export function timeline_item_from_stored_row(
  row: chat_room_timeline_message,
  source: timeline_item_source = 'initial_fetch',
): timeline_item | null {
  if (row.timeline_item_kind === 'action') {
    const uuid = (row.chat_action_uuid ?? row.message_uuid).trim()

    if (!uuid) {
      return null
    }

    return {
      kind: 'action',
      uuid,
      room_uuid: row.room_uuid,
      created_at: row.created_at,
      source,
      row,
    }
  }

  return timeline_item_from_message_row(row, source)
}

/**
 * Single merge for initial fetch + realtime: map by `kind:uuid`, sort by created_at asc.
 */
export function merge_timeline_items(items: timeline_item[]): {
  rows: chat_room_timeline_message[]
  duplicates_skipped: timeline_item_duplicate_skip[]
} {
  const by_key = new Map<string, timeline_item>()
  const duplicates_skipped: timeline_item_duplicate_skip[] = []

  for (const item of items) {
    const key = timeline_item_key(item.kind, item.uuid)

    if (by_key.has(key)) {
      duplicates_skipped.push({
        room_uuid: item.room_uuid,
        item_key: key,
        kind: item.kind,
        uuid: item.uuid,
        source: item.source,
      })
      continue
    }

    by_key.set(key, item)
  }

  const rows = Array.from(by_key.values())
    .sort((a, b) =>
      compare_timeline_messages_chronological(a.row, b.row),
    )
    .map((item) => item.row)

  return { rows, duplicates_skipped }
}

export function merge_timeline_message_rows(
  previous: chat_room_timeline_message[],
  addition: chat_room_timeline_message[],
  source: timeline_item_source,
): {
  rows: chat_room_timeline_message[]
  duplicates_skipped: timeline_item_duplicate_skip[]
  prev_message_count: number
  next_message_count: number
  dedupe_hit: boolean
} {
  const items: timeline_item[] = []

  for (const row of previous) {
    const item = timeline_item_from_stored_row(row, 'initial_fetch')

    if (item) {
      items.push(item)
    }
  }

  for (const row of addition) {
    const item =
      row.timeline_item_kind === 'action'
        ? timeline_item_from_stored_row(row, source)
        : timeline_item_from_message_row(row, source)

    if (item) {
      items.push(item)
    }
  }

  const merged = merge_timeline_items(items)

  return {
    rows: merged.rows,
    duplicates_skipped: merged.duplicates_skipped,
    prev_message_count: previous.length,
    next_message_count: merged.rows.length,
    dedupe_hit: merged.duplicates_skipped.length > 0,
  }
}

/**
 * Realtime rows often omit `sequence` in JSON (defaults to 0 in the client parser).
 * Treat 0 like unknown so tie-break falls through to message_uuid.
 */
export function timeline_sequence_sort_value(
  sequence: number | null | undefined,
): number | null {
  if (sequence === null || sequence === undefined || sequence === 0) {
    return null
  }

  return sequence
}

export function archived_messages_to_reception_timeline(
  rows: archived_message[],
): chat_room_timeline_message[] {
  const items = rows
    .map(archived_message_to_timeline_message)
    .map((row) => timeline_item_from_message_row(row, 'initial_fetch'))
    .filter((item): item is timeline_item => item !== null)

  return merge_timeline_items(items).rows
}

function timeline_created_at_sort_ms(iso: string | null | undefined): number {
  if (!iso) {
    return 0
  }

  const t = new Date(iso).getTime()

  return Number.isNaN(t) ? 0 : t
}

function timeline_inserted_at_sort_ms(iso: string | null | undefined): number {
  if (!iso) {
    return 0
  }

  const t = new Date(iso).getTime()

  return Number.isNaN(t) ? 0 : t
}

/**
 * Global chronological order for merged fetch + realtime rows.
 * Primary: created_at. Then inserted_at, sequence, message_uuid.
 */
export function compare_timeline_messages_chronological(
  a: chat_room_timeline_message,
  b: chat_room_timeline_message,
): number {
  const ca = timeline_created_at_sort_ms(a.created_at)
  const cb = timeline_created_at_sort_ms(b.created_at)

  if (ca !== cb) {
    return ca - cb
  }

  const ia = timeline_inserted_at_sort_ms(a.inserted_at)
  const ib = timeline_inserted_at_sort_ms(b.inserted_at)

  if (ia !== ib) {
    return ia - ib
  }

  const sa = timeline_sequence_sort_value(a.sequence)
  const sb = timeline_sequence_sort_value(b.sequence)

  if (sa !== null && sb !== null && sa !== sb) {
    return sa - sb
  }

  if (sa !== null && sb === null) {
    return -1
  }

  if (sb !== null && sa === null) {
    return 1
  }

  return timeline_render_key(a).localeCompare(timeline_render_key(b))
}

/** @deprecated Use merge_timeline_items */
export function normalize_chat_timeline_messages(
  rows: chat_room_timeline_message[],
): chat_room_timeline_message[] {
  const items = rows
    .map((row) => timeline_item_from_stored_row(row, 'initial_fetch'))
    .filter((item): item is timeline_item => item !== null)

  return merge_timeline_items(items).rows
}

export function chat_timeline_time_bounds(rows: chat_room_timeline_message[]): {
  oldest_created_at: string | null
  newest_created_at: string | null
} {
  let oldest: string | null = null
  let newest: string | null = null

  for (const m of rows) {
    const c = m.created_at

    if (!c) {
      continue
    }

    if (!oldest || c < oldest) {
      oldest = c
    }

    if (!newest || c > newest) {
      newest = c
    }
  }

  return { oldest_created_at: oldest, newest_created_at: newest }
}

/** @deprecated Prefer compare_timeline_messages_chronological */
export function compare_chat_room_timeline_messages(
  a: chat_room_timeline_message,
  b: chat_room_timeline_message,
): number {
  return compare_timeline_messages_chronological(a, b)
}
