import 'server-only'

import type { archived_message } from './archive'

function room_has_line_initial_or_ack(archived_messages: archived_message[]) {
  return archived_messages.some((row) => {
    const bundle = row.bundle

    if (
      bundle.bundle_type === 'welcome' ||
      bundle.bundle_type === 'initial_carousel'
    ) {
      return true
    }

    if (
      bundle.sender === 'bot' &&
      bundle.bundle_type === 'text' &&
      'content_key' in bundle &&
      bundle.content_key === 'line.followup.ack'
    ) {
      return true
    }

    return false
  })
}

/**
 * Seed welcome + carousel when the room has no bot initial seed yet.
 * Incoming user rows alone must not block the first LINE reply.
 * LINE follow-up ack rows count as handled so we do not double-seed.
 */
export function should_seed_initial_messages(
  archived_messages: archived_message[],
) {
  return !room_has_line_initial_or_ack(archived_messages)
}
