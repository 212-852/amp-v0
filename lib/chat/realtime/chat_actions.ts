'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'

import type { archived_message } from '@/lib/chat/archive'
import type { message_bundle } from '@/lib/chat/message'
import {
  admin_timeline_chat_action_types,
  chat_action_timeline_text,
  chat_action_to_admin_timeline_row,
  merge_timeline_message_rows,
  parse_chat_action_timeline_row,
  type chat_action_timeline_payload,
  type chat_room_timeline_message,
  is_admin_timeline_chat_action_type,
} from '@/lib/chat/timeline_display'

import { send_chat_realtime_debug } from './client'

export const realtime_timeline_chat_action_types = admin_timeline_chat_action_types

export type chat_action_realtime_payload = chat_action_timeline_payload

/** @deprecated Use chat_action_realtime_payload */
export type chat_support_action_payload = chat_action_realtime_payload

export type chat_actions_realtime_scope =
  | 'admin_active'
  | 'user_active'
  | 'admin_list'

export function chat_actions_realtime_channel_name(
  room_uuid: string,
  scope: chat_actions_realtime_scope,
) {
  return `chat_actions:${scope}:${room_uuid}`
}

export function is_realtime_timeline_chat_action_type(
  action_type: string,
): boolean {
  return is_admin_timeline_chat_action_type(action_type)
}

export function parse_chat_action_realtime_row(
  value: unknown,
): chat_action_realtime_payload | null {
  return parse_chat_action_timeline_row(value)
}

export { chat_action_timeline_text, chat_action_to_admin_timeline_row }

export function chat_action_visible_to_listener_scope(input: {
  action_type: string
  visibility: string | null
  scope: chat_actions_realtime_scope
}): boolean {
  if (!is_realtime_timeline_chat_action_type(input.action_type)) {
    return false
  }

  if (input.scope === 'user_active') {
    if (input.action_type === 'internal_note_created') {
      return false
    }

    return true
  }

  if (input.scope === 'admin_list') {
    return (
      input.action_type === 'support_started' ||
      input.action_type === 'support_left'
    )
  }

  return true
}

export function chat_action_to_archived_message(
  action: chat_action_realtime_payload,
): archived_message {
  const text = chat_action_timeline_text(action)

  const bundle = {
    bundle_uuid: action.action_uuid,
    bundle_type: 'room_action_log',
    sender: 'bot',
    version: 1,
    locale: 'ja',
    content_key: `chat_action.${action.action_type}`,
    metadata: {
      from_chat_actions_realtime: true,
      chat_action_type: action.action_type,
      chat_action_uuid: action.action_uuid,
      actor_display_name: action.actor_display_name,
      actor_user_uuid: action.actor_user_uuid,
    },
    payload: {
      text,
    },
  } as message_bundle

  return {
    archive_uuid: action.action_uuid,
    room_uuid: action.room_uuid,
    sequence: 0,
    bundle,
    created_at: action.created_at ?? new Date().toISOString(),
    inserted_at: null,
  }
}

function chat_action_debug_payload(
  action: chat_action_realtime_payload | null,
  inserted_index: number | null,
) {
  return {
    room_uuid: action?.room_uuid ?? null,
    action_uuid: action?.action_uuid ?? null,
    action_type: action?.action_type ?? null,
    actor_user_uuid: action?.actor_user_uuid ?? null,
    actor_name: action?.actor_display_name ?? null,
    created_at: action?.created_at ?? null,
    inserted_index,
  }
}

function emit_timeline_duplicate_skips(
  skips: import('@/lib/chat/timeline_display').timeline_item_duplicate_skip[],
) {
  for (const skip of skips) {
    send_chat_realtime_debug({
      category: 'admin_chat',
      event: 'timeline_item_duplicate_skipped',
      room_uuid: skip.room_uuid,
      active_room_uuid: skip.room_uuid,
      action_uuid: skip.kind === 'action' ? skip.uuid : null,
      message_uuid: skip.kind === 'message' ? skip.uuid : null,
      event_type: skip.kind,
      ignored_reason: skip.item_key,
      reason: skip.source,
      phase: 'merge_timeline_items',
    })
  }
}

export function append_chat_action_to_admin_timeline(
  previous: chat_room_timeline_message[],
  action: chat_action_realtime_payload,
): { rows: chat_room_timeline_message[]; appended: boolean } {
  const system_row = chat_action_to_admin_timeline_row(action)
  const merged = merge_timeline_message_rows(previous, [system_row], 'realtime')

  emit_timeline_duplicate_skips(merged.duplicates_skipped)

  return {
    rows: merged.rows,
    appended: merged.rows.length > previous.length,
  }
}

export function subscribe_chat_actions_realtime(input: {
  supabase: SupabaseClient
  room_uuid: string
  scope: chat_actions_realtime_scope
  source_channel?: string | null
  on_action: (action: chat_action_realtime_payload, inserted_index: number) => void
  on_subscribed?: () => void
}): RealtimeChannel {
  const channel_name = chat_actions_realtime_channel_name(
    input.room_uuid,
    input.scope,
  )
  const postgres_filter = `room_uuid=eq.${input.room_uuid}`
  let inserted_index = 0

  send_chat_realtime_debug({
    event: 'support_action_realtime_subscribe_started',
    room_uuid: input.room_uuid,
    active_room_uuid: input.room_uuid,
    source_channel: input.source_channel ?? 'web',
    channel_name,
    schema: 'public',
    table: 'chat_actions',
    filter: postgres_filter,
    phase: 'subscribe_chat_actions_realtime',
  })

  send_chat_realtime_debug({
    event: 'chat_action_realtime_subscribe_started',
    room_uuid: input.room_uuid,
    source_channel: input.source_channel ?? 'web',
    channel_name,
    schema: 'public',
    table: 'chat_actions',
    filter: postgres_filter,
    phase: 'subscribe_chat_actions_realtime',
  })

  const channel = input.supabase
    .channel(channel_name)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_actions',
        filter: postgres_filter,
      },
      (payload) => {
        const raw = payload.new as Record<string, unknown> | undefined
        const action = raw ? parse_chat_action_realtime_row(raw) : null
        const visibility =
          raw && typeof raw.visibility === 'string' ? raw.visibility : null

        send_chat_realtime_debug({
          event: 'chat_action_realtime_received',
          ...chat_action_debug_payload(action, inserted_index),
          source_channel: input.source_channel ?? 'web',
          channel_name,
          schema: 'public',
          table: 'chat_actions',
          filter: postgres_filter,
          payload_room_uuid: action?.room_uuid ?? null,
          payload_action_uuid: action?.action_uuid ?? null,
          ignored_reason: action ? null : 'unparseable_chat_action_row',
          phase: 'postgres_changes_chat_actions',
        })

        if (
          action?.action_type === 'support_started' ||
          action?.action_type === 'support_left'
        ) {
          send_chat_realtime_debug({
            event: 'support_action_realtime_payload_received',
            room_uuid: action.room_uuid,
            active_room_uuid: input.room_uuid,
            action_uuid: action.action_uuid,
            event_type: action.action_type,
            ignored_reason: null,
            phase: 'postgres_changes_chat_actions',
          })
        }

        if (!action) {
          send_chat_realtime_debug({
            event: 'chat_action_realtime_ignored',
            ...chat_action_debug_payload(null, inserted_index),
            source_channel: input.source_channel ?? 'web',
            channel_name,
            ignored_reason: 'unparseable_chat_action_row',
            phase: 'postgres_changes_chat_actions',
          })
          return
        }

        if (action.room_uuid.trim() !== input.room_uuid.trim()) {
          if (
            action.action_type === 'support_started' ||
            action.action_type === 'support_left'
          ) {
            send_chat_realtime_debug({
              event: 'support_action_realtime_ignored',
              room_uuid: action.room_uuid,
              active_room_uuid: input.room_uuid,
              action_uuid: action.action_uuid,
              event_type: action.action_type,
              ignored_reason: 'payload_room_uuid_mismatch',
              phase: 'postgres_changes_chat_actions',
            })
          }

          if (action.action_type === 'support_left') {
            send_chat_realtime_debug({
              event: 'support_left_realtime_ignored',
              room_uuid: action.room_uuid,
              active_room_uuid: input.room_uuid,
              action_uuid: action.action_uuid,
              action_type: action.action_type,
              ignored_reason: 'payload_room_uuid_mismatch',
              phase: 'postgres_changes_chat_actions',
            })
          }

          send_chat_realtime_debug({
            event: 'chat_action_realtime_ignored',
            ...chat_action_debug_payload(action, inserted_index),
            source_channel: input.source_channel ?? 'web',
            channel_name,
            ignored_reason: 'payload_room_uuid_mismatch',
            phase: 'postgres_changes_chat_actions',
          })
          return
        }

        if (
          !chat_action_visible_to_listener_scope({
            action_type: action.action_type,
            visibility,
            scope: input.scope,
          })
        ) {
          if (
            action.action_type === 'support_started' ||
            action.action_type === 'support_left'
          ) {
            send_chat_realtime_debug({
              event: 'support_action_realtime_ignored',
              room_uuid: action.room_uuid,
              active_room_uuid: input.room_uuid,
              action_uuid: action.action_uuid,
              event_type: action.action_type,
              ignored_reason: 'unsupported_action_type_or_visibility',
              phase: 'postgres_changes_chat_actions',
            })
          }

          if (action.action_type === 'support_left') {
            send_chat_realtime_debug({
              event: 'support_left_realtime_ignored',
              room_uuid: action.room_uuid,
              active_room_uuid: input.room_uuid,
              action_uuid: action.action_uuid,
              action_type: action.action_type,
              ignored_reason: 'unsupported_action_type_or_visibility',
              phase: 'postgres_changes_chat_actions',
            })
          }

          send_chat_realtime_debug({
            event: 'chat_action_realtime_ignored',
            ...chat_action_debug_payload(action, inserted_index),
            source_channel: input.source_channel ?? 'web',
            channel_name,
            ignored_reason: 'unsupported_action_type_or_visibility',
            phase: 'postgres_changes_chat_actions',
          })
          return
        }

        const index = inserted_index
        inserted_index += 1

        send_chat_realtime_debug({
          event: 'chat_action_realtime_accepted',
          ...chat_action_debug_payload(action, index),
          source_channel: input.source_channel ?? 'web',
          channel_name,
          ignored_reason: null,
          phase: 'postgres_changes_chat_actions',
        })

        input.on_action(action, index)
      },
    )
    .subscribe((status, err) => {
      send_chat_realtime_debug({
        event: 'chat_action_realtime_subscribe_status',
        room_uuid: input.room_uuid,
        source_channel: input.source_channel ?? 'web',
        channel_name,
        subscribe_status: status,
        error_message: err ? String(err) : null,
        phase: 'subscribe_chat_actions_realtime',
      })

      if (status === 'SUBSCRIBED') {
        input.on_subscribed?.()
      }
    })

  return channel
}

export function cleanup_chat_actions_realtime(input: {
  supabase: SupabaseClient
  channel: RealtimeChannel
  room_uuid: string
  scope: chat_actions_realtime_scope
  cleanup_reason: string
}) {
  send_chat_realtime_debug({
    event: 'chat_action_realtime_cleanup_started',
    room_uuid: input.room_uuid,
    channel_name: chat_actions_realtime_channel_name(
      input.room_uuid,
      input.scope,
    ),
    cleanup_reason: input.cleanup_reason,
    phase: 'cleanup_chat_actions_realtime',
  })

  void input.supabase.removeChannel(input.channel)
}

export function emit_chat_action_realtime_rendered(input: {
  room_uuid: string
  active_room_uuid?: string | null
  action: chat_action_realtime_payload
  inserted_index: number
  source_channel?: string | null
  phase?: string
}) {
  const active_room_uuid = input.active_room_uuid ?? input.room_uuid

  send_chat_realtime_debug({
    event: 'chat_action_realtime_rendered',
    ...chat_action_debug_payload(input.action, input.inserted_index),
    room_uuid: input.room_uuid,
    active_room_uuid,
    source_channel: input.source_channel ?? 'web',
    phase: input.phase ?? 'chat_action_timeline_render',
  })

  if (input.action.action_type === 'support_left') {
    send_chat_realtime_debug({
      event: 'support_left_realtime_rendered',
      room_uuid: input.action.room_uuid,
      active_room_uuid,
      action_uuid: input.action.action_uuid,
      action_type: input.action.action_type,
      ignored_reason: null,
      phase: input.phase ?? 'chat_action_timeline_render',
    })
  }

  if (
    input.action.action_type === 'support_started' ||
    input.action.action_type === 'support_left'
  ) {
    send_chat_realtime_debug({
      event: 'support_action_realtime_rendered',
      room_uuid: input.action.room_uuid,
      active_room_uuid,
      action_uuid: input.action.action_uuid,
      event_type: input.action.action_type,
      ignored_reason: null,
      phase: input.phase ?? 'chat_action_timeline_render',
    })
  }

  if (input.action.action_type === 'support_started') {
    send_chat_realtime_debug({
      event: 'support_started_realtime_rendered',
      room_uuid: input.action.room_uuid,
      active_room_uuid,
      action_uuid: input.action.action_uuid,
      event_type: input.action.action_type,
      ignored_reason: null,
      phase: input.phase ?? 'chat_action_timeline_render',
    })
  }
}
