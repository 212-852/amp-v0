'use client'

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

import {
  archived_message_from_message_row,
  type message_insert_row,
} from './row'

export type chat_realtime_role = 'user' | 'admin' | 'concierge' | 'bot'

export type chat_typing_payload = {
  room_uuid: string
  participant_uuid: string
  user_uuid?: string | null
  role: chat_realtime_role
  display_name?: string | null
  is_typing: boolean
  typed_at: string
}

type chat_realtime_debug_event =
  | 'chat_realtime_subscribe_started'
  | 'chat_realtime_subscribe_failed'
  | 'chat_realtime_message_received'
  | 'chat_realtime_typing_received'
  | 'chat_typing_publish_started'
  | 'chat_typing_publish_failed'
  | 'chat_typing_publish_succeeded'

export const chat_typing_expire_ms = 3_000

export function chat_room_realtime_channel_name(room_uuid: string) {
  return `chat_room:${room_uuid}`
}

export function chat_typing_is_fresh(input: {
  is_typing: boolean
  typed_at: string
  now?: Date
}) {
  if (!input.is_typing) {
    return false
  }

  const typed_at = new Date(input.typed_at).getTime()

  if (Number.isNaN(typed_at)) {
    return false
  }

  return (input.now ?? new Date()).getTime() - typed_at <= chat_typing_expire_ms
}

export function send_chat_realtime_debug(input: {
  event: chat_realtime_debug_event
  room_uuid: string | null
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  source_channel?: string | null
  phase: string
  error_code?: string | null
  error_message?: string | null
  error_details?: string | null
  error_hint?: string | null
}) {
  void fetch('/api/debug/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => {})
}

export function subscribe_chat_room_realtime(input: {
  supabase: SupabaseClient
  room_uuid: string
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  on_message: (message: ReturnType<typeof archived_message_from_message_row>) => void
  on_typing: (payload: chat_typing_payload) => void
}): RealtimeChannel {
  send_chat_realtime_debug({
    event: 'chat_realtime_subscribe_started',
    room_uuid: input.room_uuid,
    participant_uuid: input.participant_uuid,
    user_uuid: input.user_uuid,
    role: input.role,
    source_channel: 'web',
    phase: 'subscribe_chat_room_realtime',
  })

  const channel = input.supabase
    .channel(chat_room_realtime_channel_name(input.room_uuid))
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_uuid=eq.${input.room_uuid}`,
      },
      (payload) => {
        const message = archived_message_from_message_row(
          payload.new as message_insert_row,
        )

        if (!message) {
          return
        }

        send_chat_realtime_debug({
          event: 'chat_realtime_message_received',
          room_uuid: input.room_uuid,
          participant_uuid: input.participant_uuid,
          user_uuid: input.user_uuid,
          role: input.role,
          source_channel: 'web',
          phase: 'message_insert_received',
        })
        input.on_message(message)
      },
    )
    .on('broadcast', { event: 'typing' }, (payload) => {
      const typing = payload.payload as chat_typing_payload

      if (typing.room_uuid !== input.room_uuid) {
        return
      }

      send_chat_realtime_debug({
        event: 'chat_realtime_typing_received',
        room_uuid: input.room_uuid,
        participant_uuid: input.participant_uuid,
        user_uuid: input.user_uuid,
        role: input.role,
        source_channel: 'web',
        phase: 'typing_broadcast_received',
      })
      input.on_typing(typing)
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        send_chat_realtime_debug({
          event: 'chat_realtime_subscribe_failed',
          room_uuid: input.room_uuid,
          participant_uuid: input.participant_uuid,
          user_uuid: input.user_uuid,
          role: input.role,
          source_channel: 'web',
          phase: `subscribe_status_${status.toLowerCase()}`,
          error_code: status,
          error_message: 'Realtime subscription failed',
        })
      }
    })

  return channel
}

export function publish_chat_typing(input: {
  channel: RealtimeChannel
  room_uuid: string
  participant_uuid: string
  user_uuid?: string | null
  role: chat_realtime_role
  display_name?: string | null
  is_typing: boolean
}) {
  send_chat_realtime_debug({
    event: 'chat_typing_publish_started',
    room_uuid: input.room_uuid,
    participant_uuid: input.participant_uuid,
    user_uuid: input.user_uuid,
    role: input.role,
    source_channel: 'web',
    phase: 'typing_broadcast_send',
  })

  void input.channel
    .send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        room_uuid: input.room_uuid,
        participant_uuid: input.participant_uuid,
        user_uuid: input.user_uuid ?? null,
        role: input.role,
        display_name: input.display_name ?? null,
        is_typing: input.is_typing,
        typed_at: new Date().toISOString(),
      } satisfies chat_typing_payload,
    })
    .then((result) => {
      send_chat_realtime_debug({
        event:
          result === 'ok'
            ? 'chat_typing_publish_succeeded'
            : 'chat_typing_publish_failed',
        room_uuid: input.room_uuid,
        participant_uuid: input.participant_uuid,
        user_uuid: input.user_uuid,
        role: input.role,
        source_channel: 'web',
        phase: 'typing_broadcast_send',
        error_code: result === 'ok' ? null : result,
        error_message: result === 'ok' ? null : 'Typing broadcast failed',
      })
    })
    .catch((error: unknown) => {
      send_chat_realtime_debug({
        event: 'chat_typing_publish_failed',
        room_uuid: input.room_uuid,
        participant_uuid: input.participant_uuid,
        user_uuid: input.user_uuid,
        role: input.role,
        source_channel: 'web',
        phase: 'typing_broadcast_send',
        error_message: error instanceof Error ? error.message : String(error),
      })
    })
}
