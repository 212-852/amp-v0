'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'

import {
  publish_chat_typing,
  send_chat_realtime_debug,
  sync_chat_typing_presence,
  type chat_realtime_role,
} from './client'

export type send_staff_typing_status_input = {
  room_uuid: string
  participant_uuid: string
  user_uuid: string | null
  is_typing: boolean
  role?: chat_realtime_role
  source_channel?: string
  channel?: RealtimeChannel | null
  active_room_uuid?: string | null
  typing_phase?: 'start' | 'heartbeat'
}

const staff_typing_action_phase = 'lib/chat/realtime/staff_typing_action.ts'

function emit_staff_typing_send_debug(
  event:
    | 'staff_typing_status_send_started'
    | 'staff_typing_status_sent'
    | 'staff_typing_status_stopped'
    | 'staff_typing_status_send_failed',
  payload: {
    room_uuid: string | null
    active_room_uuid: string | null
    participant_uuid: string | null
    user_uuid: string | null
    role: string
    source_channel: string
    is_typing: boolean
    subscribe_status?: string | null
    ignored_reason?: string | null
    error_message?: string | null
  },
) {
  send_chat_realtime_debug({
    category: 'chat_realtime',
    event,
    owner: 'admin',
    room_uuid: payload.room_uuid,
    active_room_uuid: payload.active_room_uuid,
    participant_uuid: payload.participant_uuid,
    user_uuid: payload.user_uuid,
    role: payload.role,
    source_channel: payload.source_channel,
    is_typing: payload.is_typing,
    subscribe_status: payload.subscribe_status ?? null,
    ignored_reason: payload.ignored_reason ?? null,
    error_message: payload.error_message ?? null,
    phase: staff_typing_action_phase,
  })
}

export function send_staff_typing_status(input: send_staff_typing_status_input) {
  const room_uuid = input.room_uuid.trim()
  const participant_uuid = input.participant_uuid.trim()
  const role = input.role === 'admin' ? 'admin' : 'concierge'
  const source_channel = input.source_channel ?? 'web'
  const active_room_uuid = (input.active_room_uuid ?? room_uuid).trim() || room_uuid
  const base_payload = {
    room_uuid: room_uuid || null,
    active_room_uuid: active_room_uuid || null,
    participant_uuid: participant_uuid || null,
    user_uuid: input.user_uuid,
    role,
    source_channel,
    is_typing: input.is_typing,
  }

  emit_staff_typing_send_debug('staff_typing_status_send_started', base_payload)

  if (!room_uuid || !participant_uuid) {
    emit_staff_typing_send_debug('staff_typing_status_send_failed', {
      ...base_payload,
      ignored_reason: 'missing_room_or_participant',
    })

    return
  }

  sync_chat_typing_presence({
    room_uuid,
    participant_uuid,
    is_typing: input.is_typing,
    source_channel,
    typing_phase: input.is_typing ? input.typing_phase : undefined,
  })

  const channel = input.channel ?? null
  const is_heartbeat = input.is_typing && input.typing_phase === 'heartbeat'
  const should_broadcast =
    Boolean(channel) && (!input.is_typing || !is_heartbeat)

  if (!should_broadcast) {
    if (!channel) {
      emit_staff_typing_send_debug('staff_typing_status_send_failed', {
        ...base_payload,
        room_uuid,
        active_room_uuid,
        participant_uuid,
        subscribe_status: 'CHANNEL_UNAVAILABLE',
        ignored_reason: 'channel_unavailable',
      })
    }

    if (!input.is_typing) {
      emit_staff_typing_send_debug('staff_typing_status_stopped', {
        ...base_payload,
        room_uuid,
        active_room_uuid,
        participant_uuid,
        subscribe_status: channel ? 'HEARTBEAT_ONLY' : 'CHANNEL_UNAVAILABLE',
      })
    }

    return
  }

  publish_chat_typing({
    channel: channel!,
    room_uuid,
    active_room_uuid,
    participant_uuid,
    user_uuid: input.user_uuid,
    role,
    display_name: null,
    is_typing: input.is_typing,
    source_channel,
  })

  if (input.is_typing) {
    emit_staff_typing_send_debug('staff_typing_status_sent', {
      ...base_payload,
      room_uuid,
      active_room_uuid,
      participant_uuid,
      subscribe_status: 'BROADCAST_REQUESTED',
    })

    return
  }

  emit_staff_typing_send_debug('staff_typing_status_stopped', {
    ...base_payload,
    room_uuid,
    active_room_uuid,
    participant_uuid,
    subscribe_status: 'BROADCAST_REQUESTED',
  })
}
