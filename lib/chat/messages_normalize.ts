import type { archived_message } from '@/lib/chat/archive'

function created_at_sort_ms(iso: string | null | undefined): number {
  if (!iso) {
    return 0
  }

  const t = new Date(iso).getTime()

  return Number.isNaN(t) ? 0 : t
}

function inserted_at_sort_ms(iso: string | null | undefined): number {
  if (!iso) {
    return 0
  }

  const t = new Date(iso).getTime()

  return Number.isNaN(t) ? 0 : t
}

export function compare_archived_messages_chronological(
  a: archived_message,
  b: archived_message,
): number {
  const ca = created_at_sort_ms(a.created_at)
  const cb = created_at_sort_ms(b.created_at)

  if (ca !== cb) {
    return ca - cb
  }

  const ia = inserted_at_sort_ms(a.inserted_at)
  const ib = inserted_at_sort_ms(b.inserted_at)

  if (ia !== ib) {
    return ia - ib
  }

  if (a.sequence !== b.sequence) {
    return a.sequence - b.sequence
  }

  return a.archive_uuid.localeCompare(b.archive_uuid)
}

export function dedupe_archived_messages_by_message_uuid(
  messages: archived_message[],
): archived_message[] {
  const by_uuid = new Map<string, archived_message>()

  for (const row of messages) {
    const prev = by_uuid.get(row.archive_uuid)

    if (!prev) {
      by_uuid.set(row.archive_uuid, row)
      continue
    }

    by_uuid.set(
      row.archive_uuid,
      compare_archived_messages_chronological(prev, row) <= 0 ? row : prev,
    )
  }

  return Array.from(by_uuid.values())
}

export function normalize_archived_messages(
  messages: archived_message[],
): archived_message[] {
  return dedupe_archived_messages_by_message_uuid(messages).sort(
    compare_archived_messages_chronological,
  )
}

export function archived_messages_time_bounds(messages: archived_message[]): {
  oldest_created_at: string | null
  newest_created_at: string | null
} {
  let oldest: string | null = null
  let newest: string | null = null

  for (const m of messages) {
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
