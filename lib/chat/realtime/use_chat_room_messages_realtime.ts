'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { create_browser_supabase } from '@/lib/db/browser'

import {
  cleanup_chat_room_realtime,
  subscribe_chat_room_realtime,
  type chat_presence_payload,
  type chat_typing_payload,
} from './client'
import type { chat_messages_realtime_listener_kind } from './messages_client'
import type { realtime_archived_message } from './row'

export type use_chat_room_messages_realtime_input = {
  kind: chat_messages_realtime_listener_kind
  room_uuid: string
  enabled?: boolean
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel: string
  active_room_uuid?: string | null
  active_typing_identity_ref?: MutableRefObject<{
    user_uuid: string | null
    participant_uuid: string | null
    role: string | null
  }>
  on_message: (message: realtime_archived_message) => void
  on_typing: (payload: chat_typing_payload) => void
  on_presence?: (payload: chat_presence_payload) => void
  on_subscribe_status?: (payload: {
    status: string
    error_message: string | null
  }) => void
}

export function use_chat_room_messages_realtime(
  input: use_chat_room_messages_realtime_input,
) {
  const channel_ref = useRef<RealtimeChannel | null>(null)
  const on_message_ref = useRef(input.on_message)
  const on_typing_ref = useRef(input.on_typing)
  const on_presence_ref = useRef(input.on_presence)
  const on_subscribe_status_ref = useRef(input.on_subscribe_status)

  useEffect(() => {
    on_message_ref.current = input.on_message
  }, [input.on_message])

  useEffect(() => {
    on_typing_ref.current = input.on_typing
  }, [input.on_typing])

  useEffect(() => {
    on_presence_ref.current = input.on_presence
  }, [input.on_presence])

  useEffect(() => {
    on_subscribe_status_ref.current = input.on_subscribe_status
  }, [input.on_subscribe_status])

  useEffect(() => {
    const room_uuid = input.room_uuid.trim()
    const enabled = input.enabled !== false

    if (!enabled || !room_uuid) {
      return
    }

    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const listener_scope =
      input.kind === 'admin' ? 'admin_active' : 'user_active'
    const active_room_uuid = (input.active_room_uuid ?? room_uuid).trim()

    const channel = subscribe_chat_room_realtime({
      supabase,
      room_uuid,
      active_room_uuid,
      participant_uuid: input.participant_uuid ?? null,
      user_uuid: input.user_uuid ?? null,
      role: input.role ?? null,
      tier: input.tier ?? null,
      source_channel: input.source_channel,
      listener_scope,
      active_typing_identity_ref: input.active_typing_identity_ref,
      on_subscribe_status: (payload) => {
        on_subscribe_status_ref.current?.(payload)
      },
      on_message: (message) => {
        on_message_ref.current(message)
      },
      on_typing: (typing) => {
        on_typing_ref.current(typing)
      },
      on_presence: (presence) => {
        on_presence_ref.current?.(presence)
      },
    })

    channel_ref.current = channel

    return () => {
      cleanup_chat_room_realtime({
        supabase,
        channel,
        room_uuid,
        active_room_uuid,
        participant_uuid: input.participant_uuid ?? null,
        user_uuid: input.user_uuid ?? null,
        role: input.role ?? null,
        tier: input.tier ?? null,
        source_channel: input.source_channel,
        cleanup_reason: 'use_chat_room_messages_realtime_cleanup',
      })

      if (channel_ref.current === channel) {
        channel_ref.current = null
      }
    }
  }, [
    input.active_room_uuid,
    input.active_typing_identity_ref,
    input.enabled,
    input.kind,
    input.participant_uuid,
    input.role,
    input.room_uuid,
    input.source_channel,
    input.tier,
    input.user_uuid,
  ])

  return { channel_ref }
}
