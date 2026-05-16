'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { create_browser_supabase } from '@/lib/db/browser'

import {
  cleanup_chat_room_realtime,
  send_chat_realtime_debug,
  subscribe_chat_room_realtime,
  type chat_presence_payload,
  type chat_typing_payload,
} from './client'
import { resolve_realtime_message_channels } from './messages_client'
import type { realtime_archived_message } from './row'

export type message_realtime_owner = 'admin' | 'user'

export type message_realtime_append_result = {
  prev_count: number
  next_count: number
  dedupe_hit: boolean
}

export type use_message_realtime_input = {
  owner: message_realtime_owner
  room_uuid: string
  active_room_uuid?: string | null
  enabled?: boolean
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: string | null
  active_typing_identity_ref?: MutableRefObject<{
    user_uuid: string | null
    participant_uuid: string | null
    role: string | null
  }>
  export_messages_channel_ref?: MutableRefObject<RealtimeChannel | null>
  on_messages_channel?: (channel: RealtimeChannel | null) => void
  on_message: (
    message: realtime_archived_message,
  ) => message_realtime_append_result | void
  on_typing?: (payload: chat_typing_payload) => void
  on_presence?: (payload: chat_presence_payload) => void
}

type message_realtime_debug_event =
  | 'message_realtime_mounted'
  | 'message_realtime_subscribe_started'
  | 'message_realtime_subscribe_status'
  | 'message_realtime_payload_received'
  | 'message_realtime_payload_accepted'
  | 'message_realtime_payload_ignored'
  | 'message_realtime_rendered'

type message_realtime_debug_payload = {
  owner: message_realtime_owner
  room_uuid: string
  active_room_uuid: string
  message_uuid?: string | null
  source_channel?: string | null
  direction?: string | null
  ignored_reason?: string | null
  prev_count?: number | null
  next_count?: number | null
  subscribe_status?: string | null
  error_message?: string | null
}

function emit_message_realtime_debug(
  event: message_realtime_debug_event,
  payload: message_realtime_debug_payload,
) {
  send_chat_realtime_debug({
    category: 'chat_realtime',
    event,
    owner: payload.owner,
    room_uuid: payload.room_uuid,
    active_room_uuid: payload.active_room_uuid,
    message_uuid: payload.message_uuid ?? null,
    payload_message_uuid: payload.message_uuid ?? null,
    source_channel: payload.source_channel ?? null,
    direction: payload.direction ?? null,
    payload_source_channel: payload.source_channel ?? null,
    payload_direction: payload.direction ?? null,
    ignored_reason: payload.ignored_reason ?? null,
    prev_count: payload.prev_count ?? null,
    next_count: payload.next_count ?? null,
    prev_message_count: payload.prev_count ?? null,
    next_message_count: payload.next_count ?? null,
    subscribe_status: payload.subscribe_status ?? null,
    subscription_status: payload.subscribe_status ?? null,
    error_message: payload.error_message ?? null,
    phase: 'use_message_realtime',
  })
}

function listener_scope_for_owner(owner: message_realtime_owner) {
  return owner === 'admin' ? ('admin_active' as const) : ('user_active' as const)
}

function evaluate_message_room_acceptance(input: {
  payload_room_uuid: string | null
  active_room_uuid: string
}): { accept: boolean; ignored_reason: string | null } {
  const focus = input.active_room_uuid.trim()
  const pr = input.payload_room_uuid?.trim() ?? ''

  if (pr && pr !== focus) {
    return { accept: false, ignored_reason: 'payload_room_uuid_mismatch' }
  }

  return { accept: true, ignored_reason: null }
}

export function use_message_realtime(input: use_message_realtime_input) {
  const on_message_ref = useRef(input.on_message)
  const on_typing_ref = useRef(input.on_typing)
  const on_presence_ref = useRef(input.on_presence)
  const mount_debug_key_ref = useRef<string | null>(null)

  useEffect(() => {
    on_message_ref.current = input.on_message
  }, [input.on_message])

  useEffect(() => {
    on_typing_ref.current = input.on_typing
  }, [input.on_typing])

  useEffect(() => {
    on_presence_ref.current = input.on_presence
  }, [input.on_presence])

  const room_uuid = input.room_uuid.trim()
  const active_room_uuid = (input.active_room_uuid ?? input.room_uuid).trim()
  const enabled = input.enabled !== false && Boolean(room_uuid)
  const owner = input.owner
  const listener_scope = listener_scope_for_owner(owner)
  const source_channel =
    input.source_channel ?? (owner === 'admin' ? 'admin' : 'web')

  useLayoutEffect(() => {
    if (!enabled) {
      return
    }

    const mount_key = `${owner}:${room_uuid}`

    if (mount_debug_key_ref.current === mount_key) {
      return
    }

    mount_debug_key_ref.current = mount_key

    emit_message_realtime_debug('message_realtime_mounted', {
      owner,
      room_uuid,
      active_room_uuid,
      subscribe_status: 'HOOK_MOUNTED',
    })
  }, [active_room_uuid, enabled, owner, room_uuid])

  useEffect(() => {
    if (!enabled) {
      return
    }

    emit_message_realtime_debug('message_realtime_subscribe_started', {
      owner,
      room_uuid,
      active_room_uuid,
      source_channel,
      subscribe_status: 'SUBSCRIBE_REQUESTED',
    })

    const supabase = create_browser_supabase()

    if (!supabase) {
      emit_message_realtime_debug('message_realtime_subscribe_status', {
        owner,
        room_uuid,
        active_room_uuid,
        subscribe_status: 'SUPABASE_CLIENT_UNAVAILABLE',
        error_message: 'create_browser_supabase_returned_null',
        ignored_reason: 'supabase_client_unavailable',
      })

      return
    }

    const channel = subscribe_chat_room_realtime({
      supabase,
      room_uuid,
      active_room_uuid,
      participant_uuid: input.participant_uuid ?? null,
      user_uuid: input.user_uuid ?? null,
      role: input.role ?? null,
      tier: input.tier ?? null,
      source_channel,
      listener_scope,
      active_typing_identity_ref: input.active_typing_identity_ref,
      on_subscribe_status: ({ status, error_message }) => {
        emit_message_realtime_debug('message_realtime_subscribe_status', {
          owner,
          room_uuid,
          active_room_uuid,
          subscribe_status: status,
          error_message,
        })
      },
      on_message: (message) => {
        const channels = resolve_realtime_message_channels(message)
        const payload_room_uuid = (message.room_uuid ?? '').trim() || null

        emit_message_realtime_debug('message_realtime_payload_received', {
          owner,
          room_uuid,
          active_room_uuid,
          message_uuid: message.archive_uuid,
          source_channel: channels.source_channel,
          direction: channels.direction,
        })

        const acceptance = evaluate_message_room_acceptance({
          payload_room_uuid,
          active_room_uuid,
        })

        if (!acceptance.accept) {
          emit_message_realtime_debug('message_realtime_payload_ignored', {
            owner,
            room_uuid,
            active_room_uuid,
            message_uuid: message.archive_uuid,
            source_channel: channels.source_channel,
            direction: channels.direction,
            ignored_reason: acceptance.ignored_reason,
          })

          return
        }

        emit_message_realtime_debug('message_realtime_payload_accepted', {
          owner,
          room_uuid,
          active_room_uuid,
          message_uuid: message.archive_uuid,
          source_channel: channels.source_channel,
          direction: channels.direction,
        })

        const append_result = on_message_ref.current(message)

        if (append_result && !append_result.dedupe_hit) {
          emit_message_realtime_debug('message_realtime_rendered', {
            owner,
            room_uuid,
            active_room_uuid,
            message_uuid: message.archive_uuid,
            source_channel: channels.source_channel,
            direction: channels.direction,
            prev_count: append_result.prev_count,
            next_count: append_result.next_count,
          })
        }
      },
      on_typing: (typing) => {
        on_typing_ref.current?.(typing)
      },
      on_presence: (presence) => {
        on_presence_ref.current?.(presence)
      },
    })

    if (input.export_messages_channel_ref) {
      input.export_messages_channel_ref.current = channel
    }

    input.on_messages_channel?.(channel)

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
        source_channel,
        cleanup_reason: 'use_message_realtime_cleanup',
      })

      if (input.export_messages_channel_ref?.current === channel) {
        input.export_messages_channel_ref.current = null
      }

      input.on_messages_channel?.(null)
    }
  }, [
    active_room_uuid,
    enabled,
    input.active_typing_identity_ref,
    input.export_messages_channel_ref,
    input.on_messages_channel,
    input.participant_uuid,
    input.role,
    input.tier,
    input.user_uuid,
    listener_scope,
    owner,
    room_uuid,
    source_channel,
  ])
}
