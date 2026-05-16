'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'

import {
  append_chat_action_to_admin_timeline,
  type chat_action_realtime_payload,
} from '@/lib/chat/realtime/chat_actions'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import {
  archived_message_to_timeline_message,
  merge_timeline_message_rows,
  type chat_room_timeline_message,
} from '@/lib/chat/timeline_display'

type timeline_listener = () => void

let timeline_rows: chat_room_timeline_message[] = []
let messages_channel: RealtimeChannel | null = null
const timeline_listeners = new Set<timeline_listener>()

function notify_timeline_listeners() {
  for (const listener of timeline_listeners) {
    listener()
  }
}

export function subscribe_admin_reception_timeline(listener: timeline_listener) {
  timeline_listeners.add(listener)

  return () => {
    timeline_listeners.delete(listener)
  }
}

export function get_admin_reception_timeline_snapshot(): chat_room_timeline_message[] {
  return timeline_rows
}

export function reset_admin_reception_timeline(
  initial: chat_room_timeline_message[],
) {
  timeline_rows = merge_timeline_message_rows([], initial, 'initial_fetch').rows
  notify_timeline_listeners()
}

export function append_admin_reception_timeline_messages(
  addition: chat_room_timeline_message[],
) {
  const prev_count = timeline_rows.length
  const merged = merge_timeline_message_rows(timeline_rows, addition, 'realtime')
  timeline_rows = merged.rows
  notify_timeline_listeners()

  return {
    prev_count,
    next_count: timeline_rows.length,
    dedupe_hit: merged.duplicates_skipped.length > 0,
  }
}

export function append_admin_reception_realtime_message(
  archived: realtime_archived_message,
) {
  const mapped = archived_message_to_timeline_message({
    archive_uuid: archived.archive_uuid,
    room_uuid: archived.room_uuid,
    sequence: archived.sequence,
    created_at: archived.created_at,
    bundle: archived.bundle,
  })

  return append_admin_reception_timeline_messages([mapped])
}

export function append_admin_reception_realtime_action(
  action: chat_action_realtime_payload,
) {
  const prev_count = timeline_rows.length
  const merged = append_chat_action_to_admin_timeline(timeline_rows, action)

  if (merged.appended) {
    timeline_rows = merged.rows
    notify_timeline_listeners()
  }

  return {
    prev_count,
    next_count: timeline_rows.length,
    dedupe_hit: !merged.appended,
    appended: merged.appended,
  }
}

export function set_admin_reception_messages_channel(channel: RealtimeChannel | null) {
  messages_channel = channel
  notify_timeline_listeners()
}

export function get_admin_reception_messages_channel(): RealtimeChannel | null {
  return messages_channel
}
