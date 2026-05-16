'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'

import {
  publish_chat_typing,
  send_chat_realtime_debug,
  sync_chat_typing_presence,
  type chat_realtime_role,
} from './client'

export type send_room_typing_status_input = {
  room_uuid: string
  participant_uuid: string
  user_uuid?: string | null
  role: chat_realtime_role
  source_channel: string
  is_typing: boolean
  tier?: string | null
  display_name?: string | null
  channel?: RealtimeChannel | null
  active_room_uuid?: string | null
  typing_phase?: 'start' | 'heartbeat'
}

export function send_room_typing_status(input: send_room_typing_status_input) {
  const room_uuid = input.room_uuid.trim()
  const participant_uuid = input.participant_uuid.trim()

  if (!room_uuid || !participant_uuid) {
    return
  }

  sync_chat_typing_presence({
    room_uuid,
    participant_uuid,
    is_typing: input.is_typing,
    source_channel: input.source_channel,
    typing_phase: input.is_typing ? input.typing_phase : undefined,
  })

  const channel = input.channel ?? null
  const is_heartbeat = input.is_typing && input.typing_phase === 'heartbeat'
  const should_broadcast =
    Boolean(channel) &&
    (!input.is_typing || !is_heartbeat)

  if (should_broadcast && channel) {
    publish_chat_typing({
      channel,
      room_uuid,
      active_room_uuid: input.active_room_uuid ?? room_uuid,
      participant_uuid,
      user_uuid: input.user_uuid ?? null,
      role: input.role,
      tier: input.tier ?? null,
      display_name: input.display_name ?? null,
      is_typing: input.is_typing,
      source_channel: input.source_channel,
    })
  }

  send_chat_realtime_debug({
    category: 'chat_realtime',
    event: 'typing_status_sent',
    room_uuid,
    active_room_uuid: input.active_room_uuid ?? room_uuid,
    participant_uuid,
    user_uuid: input.user_uuid ?? null,
    role: input.role,
    tier: input.tier ?? null,
    source_channel: input.source_channel,
    is_typing: input.is_typing,
    subscribe_status: channel ? 'CHANNEL_ATTACHED' : 'CHANNEL_UNAVAILABLE',
    phase: 'send_room_typing_status',
  })
}
