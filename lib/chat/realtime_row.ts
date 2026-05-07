import type { archived_message } from '@/lib/chat/archive'
import type { message_bundle } from '@/lib/chat/message'

export type message_insert_row = {
  message_uuid: string
  room_uuid: string
  body: string | null
  created_at: string
}

/**
 * Client-safe parse of `messages.body` (same shape as server archive insert).
 */
export function archived_message_from_message_row(
  row: message_insert_row,
): archived_message | null {
  if (!row.body) {
    return null
  }

  try {
    const parsed = JSON.parse(row.body) as {
      bundle?: message_bundle
      bundle_type?: string
      sequence?: number
    }

    const bundle = parsed.bundle

    if (!bundle) {
      return null
    }

    const sequence =
      typeof parsed.sequence === 'number' ? parsed.sequence : 0

    return {
      archive_uuid: row.message_uuid,
      room_uuid: row.room_uuid,
      sequence,
      bundle,
      created_at: row.created_at,
    }
  } catch {
    return null
  }
}
