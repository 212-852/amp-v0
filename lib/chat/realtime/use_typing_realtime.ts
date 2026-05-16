'use client'

import {
  useCallback,
  useEffect,
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
import {
  clear_peer_typing_participant,
  handle_presence_typing_for_ui,
  handle_typing_broadcast_for_ui,
  peer_typing_label_for_admin,
  peer_typing_label_for_user,
  schedule_peer_typing_sweep,
  type peer_typing_row,
  type typing_ui_owner,
} from './typing_ui'

export type typing_realtime_owner = typing_ui_owner

type typing_realtime_debug_event =
  | 'typing_realtime_mounted'
  | 'typing_realtime_subscribe_started'
  | 'typing_realtime_subscribe_status'
  | 'typing_status_sent'
  | 'typing_realtime_payload_received'
  | 'typing_realtime_rendered'
  | 'typing_realtime_expired'
  | 'typing_realtime_payload_ignored'

type typing_realtime_debug_payload = {
  owner: typing_realtime_owner
  room_uuid: string
  active_room_uuid: string
  payload_room_uuid?: string | null
  participant_uuid?: string | null
  role?: string | null
  source_channel?: string | null
  direction?: string | null
  is_typing?: boolean | null
  ignored_reason?: string | null
  prev_count?: number | null
  next_count?: number | null
  subscribe_status?: string | null
  error_message?: string | null
}

function emit_typing_realtime_debug(
  event: typing_realtime_debug_event,
  payload: typing_realtime_debug_payload,
) {
  send_chat_realtime_debug({
    category: 'chat_realtime',
    event,
    owner: payload.owner,
    room_uuid: payload.room_uuid,
    active_room_uuid: payload.active_room_uuid,
    payload_room_uuid: payload.payload_room_uuid ?? payload.room_uuid ?? null,
    participant_uuid: payload.participant_uuid ?? null,
    role: payload.role ?? null,
    source_channel: payload.source_channel ?? null,
    direction: payload.direction ?? null,
    is_typing: payload.is_typing ?? null,
    ignored_reason: payload.ignored_reason ?? null,
    prev_count: payload.prev_count ?? null,
    next_count: payload.next_count ?? null,
    subscribe_status: payload.subscribe_status ?? null,
    subscription_status: payload.subscribe_status ?? null,
    error_message: payload.error_message ?? null,
    phase: 'use_typing_realtime',
  })
}

function listener_scope_for_owner(owner: typing_realtime_owner) {
  return owner === 'admin' ? ('admin_active' as const) : ('user_active' as const)
}

export type use_typing_realtime_input = {
  owner: typing_realtime_owner
  room_uuid: string
  active_room_uuid?: string | null
  enabled?: boolean
  participant_uuid: string
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: string | null
  /** Message hook owns postgres+broadcast; typing hook only tracks UI + debug. */
  shared_messages_channel_ref?: MutableRefObject<RealtimeChannel | null>
  on_label_change: (label: string | null) => void
  active_typing_identity_ref?: MutableRefObject<{
    user_uuid: string | null
    participant_uuid: string | null
    role: string | null
  }>
}

export function use_typing_realtime(input: use_typing_realtime_input) {
  const peer_map_ref = useRef(new Map<string, peer_typing_row>())
  const on_label_ref = useRef(input.on_label_change)
  const mount_key_ref = useRef<string | null>(null)
  const on_label_change_ref = useRef(input.on_label_change)

  useEffect(() => {
    on_label_ref.current = input.on_label_change
    on_label_change_ref.current = input.on_label_change
  }, [input.on_label_change])

  const room_uuid = input.room_uuid.trim()
  const active_room_uuid = (input.active_room_uuid ?? input.room_uuid).trim()
  const enabled = input.enabled !== false && Boolean(room_uuid)
  const owner = input.owner
  const self_participant_uuid = input.participant_uuid.trim()

  const resolve_label = useCallback(
    (map: Map<string, peer_typing_row>, self_uuid: string) => {
      return owner === 'admin'
        ? peer_typing_label_for_admin(map, self_uuid)
        : peer_typing_label_for_user(map, self_uuid)
    },
    [owner],
  )

  const refresh_label = useCallback(() => {
    on_label_ref.current(resolve_label(peer_map_ref.current, self_participant_uuid))
  }, [resolve_label, self_participant_uuid])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const mount_key = `${owner}:${room_uuid}`

    if (mount_key_ref.current === mount_key) {
      return
    }

    mount_key_ref.current = mount_key

    emit_typing_realtime_debug('typing_realtime_mounted', {
      owner,
      room_uuid,
      active_room_uuid,
      subscribe_status: input.shared_messages_channel_ref
        ? 'SHARED_MESSAGE_CHANNEL'
        : 'HOOK_MOUNTED',
    })
  }, [active_room_uuid, enabled, input.shared_messages_channel_ref, owner, room_uuid])

  const handle_typing = useCallback(
    (typing: chat_typing_payload) => {
      const payload_room_uuid = typing.room_uuid.trim() || null

      emit_typing_realtime_debug('typing_realtime_payload_received', {
        owner,
        room_uuid,
        active_room_uuid,
        payload_room_uuid,
        participant_uuid: typing.participant_uuid,
        role: typing.role,
        source_channel: null,
        is_typing: typing.is_typing,
      })

      if (payload_room_uuid && payload_room_uuid !== active_room_uuid) {
        emit_typing_realtime_debug('typing_realtime_payload_ignored', {
          owner,
          room_uuid,
          active_room_uuid,
          payload_room_uuid,
          participant_uuid: typing.participant_uuid,
          role: typing.role,
          ignored_reason: 'payload_room_uuid_mismatch',
          is_typing: typing.is_typing,
        })

        return
      }

      handle_typing_broadcast_for_ui({
        owner,
        room_uuid,
        map: peer_map_ref.current,
        typing,
        self_participant_uuid,
        on_label_change: (label) => {
          on_label_ref.current(label)
        },
        resolve_label,
      })

      emit_typing_realtime_debug('typing_realtime_rendered', {
        owner,
        room_uuid,
        active_room_uuid,
        payload_room_uuid,
        participant_uuid: typing.participant_uuid,
        role: typing.role,
        is_typing: typing.is_typing,
        prev_count: peer_map_ref.current.size,
        next_count: peer_map_ref.current.size,
      })
    },
    [active_room_uuid, owner, resolve_label, room_uuid, self_participant_uuid],
  )

  const handle_presence = useCallback(
    (presence: chat_presence_payload) => {
      const payload_room_uuid = presence.room_uuid.trim() || null

      emit_typing_realtime_debug('typing_realtime_payload_received', {
        owner,
        room_uuid,
        active_room_uuid,
        payload_room_uuid,
        participant_uuid: presence.participant_uuid,
        role: presence.role,
        source_channel: presence.source_channel,
        is_typing: presence.is_typing,
      })

      if (payload_room_uuid && payload_room_uuid !== active_room_uuid) {
        emit_typing_realtime_debug('typing_realtime_payload_ignored', {
          owner,
          room_uuid,
          active_room_uuid,
          payload_room_uuid,
          participant_uuid: presence.participant_uuid,
          role: presence.role,
          ignored_reason: 'payload_room_uuid_mismatch',
          is_typing: presence.is_typing,
        })

        return
      }

      handle_presence_typing_for_ui({
        owner,
        room_uuid,
        map: peer_map_ref.current,
        presence,
        self_participant_uuid,
        on_label_change: (label) => {
          on_label_ref.current(label)
        },
        resolve_label,
      })

      emit_typing_realtime_debug('typing_realtime_rendered', {
        owner,
        room_uuid,
        active_room_uuid,
        payload_room_uuid,
        participant_uuid: presence.participant_uuid,
        role: presence.role,
        is_typing: presence.is_typing,
        prev_count: peer_map_ref.current.size,
        next_count: peer_map_ref.current.size,
      })
    },
    [active_room_uuid, owner, resolve_label, room_uuid, self_participant_uuid],
  )

  useEffect(() => {
    if (!enabled || input.shared_messages_channel_ref) {
      return
    }

    emit_typing_realtime_debug('typing_realtime_subscribe_started', {
      owner,
      room_uuid,
      active_room_uuid,
      source_channel: input.source_channel ?? (owner === 'admin' ? 'admin' : 'web'),
      subscribe_status: 'SUBSCRIBE_REQUESTED',
    })

    const supabase = create_browser_supabase()

    if (!supabase) {
      emit_typing_realtime_debug('typing_realtime_subscribe_status', {
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
      participant_uuid: input.participant_uuid,
      user_uuid: input.user_uuid ?? null,
      role: input.role ?? null,
      tier: input.tier ?? null,
      source_channel:
        input.source_channel ?? (owner === 'admin' ? 'admin' : 'web'),
      listener_scope: listener_scope_for_owner(owner),
      active_typing_identity_ref: input.active_typing_identity_ref,
      on_subscribe_status: ({ status, error_message }) => {
        emit_typing_realtime_debug('typing_realtime_subscribe_status', {
          owner,
          room_uuid,
          active_room_uuid,
          subscribe_status: status,
          error_message,
        })
      },
      on_message: () => ({
        prev_count: 0,
        next_count: 0,
        dedupe_hit: true,
      }),
      on_typing: handle_typing,
      on_presence: handle_presence,
    })

    return () => {
      cleanup_chat_room_realtime({
        supabase,
        channel,
        room_uuid,
        active_room_uuid,
        participant_uuid: input.participant_uuid,
        user_uuid: input.user_uuid ?? null,
        role: input.role ?? null,
        tier: input.tier ?? null,
        source_channel:
          input.source_channel ?? (owner === 'admin' ? 'admin' : 'web'),
        cleanup_reason: 'use_typing_realtime_cleanup',
      })

      if (input.shared_messages_channel_ref?.current === channel) {
        input.shared_messages_channel_ref.current = null
      }
    }
  }, [
    active_room_uuid,
    enabled,
    handle_presence,
    handle_typing,
    input.active_typing_identity_ref,
    input.participant_uuid,
    input.role,
    input.shared_messages_channel_ref,
    input.source_channel,
    input.tier,
    input.user_uuid,
    owner,
    room_uuid,
  ])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const interval_id = window.setInterval(() => {
      schedule_peer_typing_sweep({
        owner,
        room_uuid,
        map: peer_map_ref.current,
        self_participant_uuid,
        on_label_change: (label) => {
          on_label_ref.current(label)
        },
        resolve_label,
      })

      const label = resolve_label(peer_map_ref.current, self_participant_uuid)

      if (!label && peer_map_ref.current.size === 0) {
        return
      }

      if (!label) {
        emit_typing_realtime_debug('typing_realtime_expired', {
          owner,
          room_uuid,
          active_room_uuid,
          prev_count: peer_map_ref.current.size,
          next_count: 0,
        })
      }
    }, 1_000)

    return () => {
      window.clearInterval(interval_id)
    }
  }, [active_room_uuid, enabled, owner, resolve_label, room_uuid, self_participant_uuid])

  const clear_peer_participant = useCallback(
    (participant_uuid: string) => {
      const trimmed = participant_uuid.trim()

      if (!trimmed) {
        return
      }

      clear_peer_typing_participant(peer_map_ref.current, trimmed)
      refresh_label()
    },
    [refresh_label],
  )

  return {
    handle_typing,
    handle_presence,
    refresh_label,
    clear_peer_participant,
    emit_typing_status_sent: (payload: {
      participant_uuid: string
      is_typing: boolean
      source_channel?: string | null
    }) => {
      emit_typing_realtime_debug('typing_status_sent', {
        owner,
        room_uuid,
        active_room_uuid,
        participant_uuid: payload.participant_uuid,
        is_typing: payload.is_typing,
        source_channel: payload.source_channel ?? null,
      })
    },
  }
}
