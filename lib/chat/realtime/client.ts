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

/** User and admin must use the same topic string for broadcast + postgres_changes. */
export function chat_room_realtime_channel_name(room_uuid: string) {
  return `room:${room_uuid}`
}

export const chat_typing_expire_ms = 3_000

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

type chat_realtime_debug_payload = {
  event: string
  room_uuid: string | null
  active_room_uuid?: string | null
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  source_channel?: string | null
  subscribe_status?: string | null
  postgres_event?: string | null
  table?: string | null
  filter?: string | null
  message_uuid?: string | null
  payload_room_uuid?: string | null
  sender_user_uuid?: string | null
  ignored_reason?: string | null
  error_code?: string | null
  error_message?: string | null
  error_details?: string | null
  error_hint?: string | null
  phase: string
}

export function send_chat_realtime_debug(input: chat_realtime_debug_payload) {
  void fetch('/api/debug/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => {})
}

function console_chat_realtime(message: string, data: Record<string, unknown>) {
  if (typeof console === 'undefined' || !console.info) {
    return
  }

  console.info(`[chat_realtime] ${message}`, data)
}

function is_chat_typing_payload(value: unknown): value is chat_typing_payload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const row = value as Record<string, unknown>

  return (
    typeof row.room_uuid === 'string' &&
    typeof row.participant_uuid === 'string' &&
    typeof row.role === 'string' &&
    typeof row.is_typing === 'boolean' &&
    typeof row.typed_at === 'string'
  )
}

export function subscribe_chat_room_realtime(input: {
  supabase: SupabaseClient
  room_uuid: string
  active_room_uuid?: string | null
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  source_channel?: string | null
  on_message: (message: ReturnType<typeof archived_message_from_message_row>) => void
  on_typing: (payload: chat_typing_payload) => void
}): RealtimeChannel {
  const channel_name = chat_room_realtime_channel_name(input.room_uuid)
  const postgres_filter = `room_uuid=eq.${input.room_uuid}`

  send_chat_realtime_debug({
    event: 'chat_realtime_channel_subscribe_status',
    room_uuid: input.room_uuid,
    active_room_uuid: input.active_room_uuid ?? input.room_uuid,
    participant_uuid: input.participant_uuid,
    user_uuid: input.user_uuid,
    role: input.role,
    source_channel: input.source_channel ?? 'web',
    subscribe_status: 'SUBSCRIBE_REQUESTED',
    postgres_event: 'INSERT',
    table: 'messages',
    filter: postgres_filter,
    phase: 'subscribe_chat_room_realtime',
  })

  console_chat_realtime('subscribe_requested', {
    channel: channel_name,
    room_uuid: input.room_uuid,
    filter: postgres_filter,
  })

  const channel = input.supabase
    .channel(channel_name, {
      config: {
        broadcast: { self: true },
      },
    })
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: postgres_filter,
      },
      (payload) => {
        const row = payload.new as message_insert_row & { room_uuid?: string }
        const payload_room_uuid =
          typeof row?.room_uuid === 'string' ? row.room_uuid : null
        const message_uuid =
          typeof row?.message_uuid === 'string' ? row.message_uuid : null

        if (payload_room_uuid && payload_room_uuid !== input.room_uuid) {
          send_chat_realtime_debug({
            event: 'chat_realtime_message_callback_ignored',
            room_uuid: input.room_uuid,
            active_room_uuid: input.active_room_uuid ?? input.room_uuid,
            participant_uuid: input.participant_uuid,
            user_uuid: input.user_uuid,
            role: input.role,
            source_channel: input.source_channel ?? 'web',
            table: 'messages',
            filter: postgres_filter,
            message_uuid,
            payload_room_uuid,
            ignored_reason: 'payload_room_uuid_mismatch',
            phase: 'postgres_changes_insert',
          })

          console_chat_realtime('message_ignored_room_mismatch', {
            expected: input.room_uuid,
            payload_room_uuid,
            message_uuid,
          })

          return
        }

        const message = archived_message_from_message_row(row as message_insert_row)

        if (!message) {
          send_chat_realtime_debug({
            event: 'chat_realtime_message_callback_ignored',
            room_uuid: input.room_uuid,
            active_room_uuid: input.active_room_uuid ?? input.room_uuid,
            participant_uuid: input.participant_uuid,
            user_uuid: input.user_uuid,
            role: input.role,
            source_channel: input.source_channel ?? 'web',
            table: 'messages',
            filter: postgres_filter,
            message_uuid,
            payload_room_uuid,
            ignored_reason: 'unparseable_message_row',
            phase: 'postgres_changes_insert',
          })

          console_chat_realtime('message_ignored_unparseable', {
            message_uuid,
            payload_room_uuid,
          })

          return
        }

        send_chat_realtime_debug({
          event: 'chat_realtime_message_callback_received',
          room_uuid: input.room_uuid,
          active_room_uuid: input.active_room_uuid ?? input.room_uuid,
          participant_uuid: input.participant_uuid,
          user_uuid: input.user_uuid,
          role: input.role,
          source_channel: input.source_channel ?? 'web',
          table: 'messages',
          filter: postgres_filter,
          message_uuid: message.archive_uuid,
          payload_room_uuid,
          phase: 'postgres_changes_insert',
        })

        console_chat_realtime('message_received', {
          message_uuid: message.archive_uuid,
          room_uuid: message.room_uuid,
        })

        input.on_message(message)
      },
    )
    .on('broadcast', { event: 'typing' }, (payload) => {
      const raw = payload.payload

      if (!is_chat_typing_payload(raw)) {
        send_chat_realtime_debug({
          event: 'chat_typing_broadcast_ignored',
          room_uuid: input.room_uuid,
          active_room_uuid: input.active_room_uuid ?? input.room_uuid,
          participant_uuid: input.participant_uuid,
          user_uuid: input.user_uuid,
          role: input.role,
          source_channel: input.source_channel ?? 'web',
          ignored_reason: 'invalid_typing_payload_shape',
          phase: 'broadcast_typing',
        })

        console_chat_realtime('typing_ignored_invalid_payload', {})

        return
      }

      if (raw.room_uuid !== input.room_uuid) {
        send_chat_realtime_debug({
          event: 'chat_typing_broadcast_ignored',
          room_uuid: input.room_uuid,
          active_room_uuid: input.active_room_uuid ?? input.room_uuid,
          participant_uuid: input.participant_uuid,
          user_uuid: input.user_uuid,
          role: input.role,
          source_channel: input.source_channel ?? 'web',
          payload_room_uuid: raw.room_uuid,
          ignored_reason: 'typing_room_uuid_mismatch',
          phase: 'broadcast_typing',
        })

        console_chat_realtime('typing_ignored_room_mismatch', {
          expected: input.room_uuid,
          payload_room_uuid: raw.room_uuid,
        })

        return
      }

      send_chat_realtime_debug({
        event: 'chat_typing_broadcast_received',
        room_uuid: input.room_uuid,
        active_room_uuid: input.active_room_uuid ?? input.room_uuid,
        participant_uuid: input.participant_uuid,
        user_uuid: input.user_uuid,
        role: input.role,
        source_channel: input.source_channel ?? 'web',
        payload_room_uuid: raw.room_uuid,
        phase: 'broadcast_typing',
      })

      console_chat_realtime('typing_received', {
        from_participant_uuid: raw.participant_uuid,
        role: raw.role,
      })

      input.on_typing(raw)
    })
    .subscribe((status, err) => {
      console_chat_realtime('subscribe_status', {
        channel: channel_name,
        status,
        err: err ? String(err) : null,
      })

      send_chat_realtime_debug({
        event: 'chat_realtime_channel_subscribe_status',
        room_uuid: input.room_uuid,
        active_room_uuid: input.active_room_uuid ?? input.room_uuid,
        participant_uuid: input.participant_uuid,
        user_uuid: input.user_uuid,
        role: input.role,
        source_channel: input.source_channel ?? 'web',
        subscribe_status: status,
        postgres_event: 'INSERT',
        table: 'messages',
        filter: postgres_filter,
        error_message: err ? String(err) : null,
        phase: 'subscribe_callback',
      })

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        send_chat_realtime_debug({
          event: 'chat_realtime_subscribe_failed',
          room_uuid: input.room_uuid,
          active_room_uuid: input.active_room_uuid ?? input.room_uuid,
          participant_uuid: input.participant_uuid,
          user_uuid: input.user_uuid,
          role: input.role,
          source_channel: input.source_channel ?? 'web',
          subscribe_status: status,
          error_code: status,
          error_message: 'Realtime subscription failed',
          phase: 'subscribe_callback',
        })
      }
    })

  return channel
}

export function publish_chat_typing(input: {
  channel: RealtimeChannel
  room_uuid: string
  active_room_uuid?: string | null
  participant_uuid: string
  user_uuid?: string | null
  role: chat_realtime_role
  display_name?: string | null
  is_typing: boolean
  source_channel?: string | null
}) {
  const source = input.source_channel ?? 'web'
  const body: chat_typing_payload = {
    room_uuid: input.room_uuid,
    participant_uuid: input.participant_uuid,
    user_uuid: input.user_uuid ?? null,
    role: input.role,
    display_name: input.display_name ?? null,
    is_typing: input.is_typing,
    typed_at: new Date().toISOString(),
  }

  console_chat_realtime('typing_publish_requested', {
    room_uuid: input.room_uuid,
    participant_uuid: input.participant_uuid,
    role: input.role,
  })

  void (async () => {
    let last_result: string | null = null

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await input.channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: body,
      })

      last_result = result

      if (result === 'ok') {
        send_chat_realtime_debug({
          event: 'chat_typing_broadcast_sent',
          room_uuid: input.room_uuid,
          active_room_uuid: input.active_room_uuid ?? input.room_uuid,
          participant_uuid: input.participant_uuid,
          user_uuid: input.user_uuid,
          role: input.role,
          source_channel: source,
          subscribe_status: 'broadcast_ok',
          phase: 'typing_broadcast_send',
        })

        console_chat_realtime('typing_publish_ok', {
          attempt,
          participant_uuid: input.participant_uuid,
        })

        return
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 100)
      })
    }

    send_chat_realtime_debug({
      event: 'chat_typing_broadcast_ignored',
      room_uuid: input.room_uuid,
      active_room_uuid: input.active_room_uuid ?? input.room_uuid,
      participant_uuid: input.participant_uuid,
      user_uuid: input.user_uuid,
      role: input.role,
      source_channel: source,
      ignored_reason: 'typing_broadcast_send_exhausted_retries',
      error_code: last_result,
      error_message: 'Typing broadcast did not reach ok before retries exhausted',
      phase: 'typing_broadcast_send',
    })

    console_chat_realtime('typing_publish_failed_retries', {
      last_result,
      participant_uuid: input.participant_uuid,
    })
  })().catch((error: unknown) => {
    send_chat_realtime_debug({
      event: 'chat_typing_broadcast_ignored',
      room_uuid: input.room_uuid,
      active_room_uuid: input.active_room_uuid ?? input.room_uuid,
      participant_uuid: input.participant_uuid,
      user_uuid: input.user_uuid,
      role: input.role,
      source_channel: source,
      ignored_reason: 'typing_broadcast_send_exception',
      error_message: error instanceof Error ? error.message : String(error),
      phase: 'typing_broadcast_send',
    })

    console_chat_realtime('typing_publish_exception', {
      error: error instanceof Error ? error.message : String(error),
    })
  })
}
