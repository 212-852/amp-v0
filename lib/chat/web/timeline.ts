import 'server-only'

import type { archived_message } from '@/lib/chat/archive'
import type { message_bundle } from '@/lib/chat/message'

export type web_timeline_filtered_row = {
  archive_uuid: string
  bundle_type: string
  content_key: string | null
  metadata: { intent: unknown }
}

function summarize_filtered_message(
  row: archived_message,
): web_timeline_filtered_row {
  const bundle = row.bundle
  const content_key =
    'content_key' in bundle && bundle.content_key !== undefined
      ? (bundle.content_key ?? null)
      : null

  let intent: unknown = null

  if (
    bundle.bundle_type === 'text' &&
    bundle.metadata &&
    typeof bundle.metadata === 'object' &&
    'intent' in bundle.metadata
  ) {
    intent = (bundle.metadata as { intent?: unknown }).intent
  }

  return {
    archive_uuid: row.archive_uuid,
    bundle_type: bundle.bundle_type,
    content_key,
    metadata: { intent },
  }
}

/**
 * Matches what `WebChat` renders: all known bundles including command text rows.
 */
function is_visible_on_web_chat(bundle: message_bundle): boolean {
  switch (bundle.bundle_type) {
    case 'welcome':
    case 'initial_carousel':
    case 'quick_menu':
    case 'how_to_use':
    case 'faq':
    case 'text':
      return true
    case 'room_action_log':
      return false
    default: {
      const unknown_bundle: never = bundle

      void unknown_bundle

      return false
    }
  }
}

export function web_chat_timeline_visibility(messages: archived_message[]) {
  const raw_count = messages.length
  const filtered_out: web_timeline_filtered_row[] = []
  let visible_count = 0

  for (const row of messages) {
    if (is_visible_on_web_chat(row.bundle)) {
      visible_count += 1
    } else {
      filtered_out.push(summarize_filtered_message(row))
    }
  }

  return {
    raw_count,
    visible_count,
    filtered_out,
  }
}
