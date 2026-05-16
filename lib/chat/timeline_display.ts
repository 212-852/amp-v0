import type { archived_message } from './archive'
import type { message_bundle } from './message'

/**
 * Admin reception timeline row derived from the same `archived_message` source
 * as user WebChat (`load_archived_messages` / message bundles).
 */
export type chat_room_timeline_support_kind = 'support_started' | 'support_left'

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
  /** When set, merges duplicate archive message + chat_actions row for support lifecycle. */
  timeline_support_kind?: chat_room_timeline_support_kind | null
  timeline_source?: 'archive' | 'chat_actions'
  /** Same as chat_actions row UUID when sourced from actions table. */
  chat_action_uuid?: string | null
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

    const meta =
      bundle.metadata && typeof bundle.metadata === 'object' && !Array.isArray(bundle.metadata)
        ? (bundle.metadata as Record<string, unknown>)
        : null
    const raw_action = meta?.action
    const timeline_support_kind: chat_room_timeline_support_kind | null =
      raw_action === 'support_started' || raw_action === 'support_left'
        ? raw_action
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
  return normalize_chat_timeline_messages(
    rows.map(archived_message_to_timeline_message),
  )
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

  return a.message_uuid.localeCompare(b.message_uuid)
}

export function dedupe_chat_timeline_messages_by_uuid(
  rows: chat_room_timeline_message[],
): chat_room_timeline_message[] {
  const by_uuid = new Map<string, chat_room_timeline_message>()

  for (const row of rows) {
    const prev = by_uuid.get(row.message_uuid)

    if (!prev) {
      by_uuid.set(row.message_uuid, row)
      continue
    }

    by_uuid.set(
      row.message_uuid,
      compare_timeline_messages_chronological(prev, row) <= 0 ? row : prev,
    )
  }

  return Array.from(by_uuid.values())
}

function timeline_created_at_sort_ms_local(
  iso: string | null | undefined,
): number {
  if (!iso) {
    return 0
  }

  const t = new Date(iso).getTime()

  return Number.isNaN(t) ? 0 : t
}

function is_support_timeline_row(row: chat_room_timeline_message): boolean {
  return (
    row.timeline_support_kind === 'support_started' ||
    row.timeline_support_kind === 'support_left'
  )
}

/**
 * Drops archived `room_action_log` support rows when a chat_actions row exists
 * for the same room, kind, body text, and nearby created_at (initial + realtime).
 */
export function dedupe_support_timeline_parallel(
  rows: chat_room_timeline_message[],
): chat_room_timeline_message[] {
  if (!rows.some(is_support_timeline_row)) {
    return rows
  }

  const others = rows.filter((r) => !is_support_timeline_row(r))
  const support = rows.filter(is_support_timeline_row)

  const from_actions = support.filter((r) => r.timeline_source === 'chat_actions')
  const from_archive = support.filter((r) => r.timeline_source !== 'chat_actions')

  const by_action = new Map<string, chat_room_timeline_message>()

  for (const r of from_actions) {
    const key = (r.chat_action_uuid ?? r.message_uuid).trim()
    const prev = by_action.get(key)

    if (!prev) {
      by_action.set(key, r)
      continue
    }

    by_action.set(
      key,
      compare_timeline_messages_chronological(prev, r) <= 0 ? r : prev,
    )
  }

  const unique_actions = Array.from(by_action.values())
  const kept_archives: chat_room_timeline_message[] = []

  for (const ar of from_archive) {
    const shadowed = unique_actions.some(
      (ca) =>
        ca.room_uuid === ar.room_uuid &&
        ca.timeline_support_kind === ar.timeline_support_kind &&
        ca.text.trim() === ar.text.trim() &&
        Math.abs(
          timeline_created_at_sort_ms_local(ca.created_at) -
            timeline_created_at_sort_ms_local(ar.created_at),
        ) < 20_000,
    )

    if (shadowed) {
      continue
    }

    kept_archives.push(ar)
  }

  return [...others, ...unique_actions, ...kept_archives]
}

export function normalize_chat_timeline_messages(
  rows: chat_room_timeline_message[],
): chat_room_timeline_message[] {
  const uuid_pass = dedupe_chat_timeline_messages_by_uuid(rows)
  const merged = dedupe_support_timeline_parallel(uuid_pass)

  return merged.sort(compare_timeline_messages_chronological)
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
