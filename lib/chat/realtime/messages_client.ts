'use client'

import { send_chat_realtime_debug } from './client'
import type { realtime_archived_message } from './row'

export type chat_messages_realtime_listener_kind = 'admin' | 'user'

const accepted_source_channels = new Set(['web', 'pwa', 'liff', 'line'])
const accepted_directions = new Set(['incoming', 'outgoing'])

export type chat_messages_realtime_debug_payload = {
  room_uuid: string | null
  active_room_uuid: string | null
  message_uuid: string | null
  source_channel: string | null
  direction: string | null
  sender_participant_uuid: string | null
  receiver_participant_uuid: string | null
  ignored_reason: string | null
  prev_count: number | null
  next_count: number | null
}

export function resolve_realtime_message_channels(
  message: realtime_archived_message,
) {
  return {
    source_channel:
      message.body_source_channel ?? message.insert_row_channel ?? null,
    direction: message.body_direction ?? null,
  }
}

export function realtime_message_source_channel_accepted(
  raw: string | null | undefined,
): boolean {
  if (!raw || !raw.trim()) {
    return true
  }

  return accepted_source_channels.has(
    raw.trim().toLowerCase() as 'web' | 'pwa' | 'liff' | 'line',
  )
}

export function realtime_message_direction_accepted(
  raw: string | null | undefined,
): boolean {
  if (!raw || !raw.trim()) {
    return true
  }

  return accepted_directions.has(
    raw.trim().toLowerCase() as 'incoming' | 'outgoing',
  )
}

export function evaluate_realtime_message_acceptance(input: {
  payload_room_uuid: string | null
  active_room_uuid: string
  message: realtime_archived_message | null
}): { accept: boolean; ignored_reason: string | null } {
  const focus = input.active_room_uuid.trim()
  const pr = input.payload_room_uuid?.trim() ?? ''

  if (!input.message) {
    return { accept: false, ignored_reason: 'unparseable_message_row' }
  }

  if (pr && pr !== focus) {
    return { accept: false, ignored_reason: 'payload_room_uuid_mismatch' }
  }

  return { accept: true, ignored_reason: null }
}

export function emit_chat_messages_realtime_debug(
  kind: chat_messages_realtime_listener_kind,
  event:
    | 'subscribe_started'
    | 'subscribe_status'
    | 'payload_received'
    | 'payload_accepted'
    | 'payload_ignored'
    | 'state_append_succeeded',
  payload: chat_messages_realtime_debug_payload & {
    subscribe_status?: string | null
    error_message?: string | null
  },
) {
  const prefix =
    kind === 'admin' ? 'admin_realtime_client' : 'user_realtime_client'

  send_chat_realtime_debug({
    category: 'chat_realtime',
    event: `${prefix}_${event}`,
    room_uuid: payload.room_uuid,
    active_room_uuid: payload.active_room_uuid,
    message_uuid: payload.message_uuid,
    payload_message_uuid: payload.message_uuid,
    source_channel: payload.source_channel,
    direction: payload.direction,
    payload_source_channel: payload.source_channel,
    payload_direction: payload.direction,
    sender_participant_uuid: payload.sender_participant_uuid,
    receiver_participant_uuid: payload.receiver_participant_uuid,
    ignored_reason: payload.ignored_reason,
    prev_count: payload.prev_count,
    next_count: payload.next_count,
    prev_message_count: payload.prev_count,
    next_message_count: payload.next_count,
    subscribe_status: payload.subscribe_status ?? null,
    error_message: payload.error_message ?? null,
    phase: `${prefix}_messages`,
  })
}
