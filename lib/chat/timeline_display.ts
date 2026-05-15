import type { archived_message } from './archive'
import type { message_bundle } from './message'

/**
 * Admin reception timeline row derived from the same `archived_message` source
 * as user WebChat (`load_archived_messages` / message bundles).
 */
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
  }
}

export function archived_messages_to_reception_timeline(
  rows: archived_message[],
): chat_room_timeline_message[] {
  return rows.map(archived_message_to_timeline_message)
}

/**
 * Realtime rows often omit `sequence` in JSON (defaults to 0 in the client parser).
 * Treat 0 like unknown so we fall back to `created_at` ordering like server-indexed rows.
 */
export function timeline_sequence_sort_value(
  sequence: number | null | undefined,
): number | null {
  if (sequence === null || sequence === undefined || sequence === 0) {
    return null
  }

  return sequence
}

export function compare_chat_room_timeline_messages(
  a: chat_room_timeline_message,
  b: chat_room_timeline_message,
): number {
  const sa = timeline_sequence_sort_value(a.sequence)
  const sb = timeline_sequence_sort_value(b.sequence)

  if (sa !== null && sb !== null) {
    return sa - sb
  }

  if (sa !== null) {
    return -1
  }

  if (sb !== null) {
    return 1
  }

  return (
    new Date(a.created_at ?? 0).getTime() -
    new Date(b.created_at ?? 0).getTime()
  )
}
