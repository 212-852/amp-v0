'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

import { create_browser_supabase } from '@/lib/db/browser'

import {
  chat_action_visible_to_listener_scope,
  cleanup_chat_actions_realtime,
  subscribe_chat_actions_realtime,
  type chat_action_realtime_payload,
  type chat_actions_realtime_scope,
} from './chat_actions'
import { send_chat_realtime_debug } from './client'

export type action_realtime_owner = 'admin' | 'user'

export type action_realtime_append_result = {
  prev_count: number
  next_count: number
  dedupe_hit: boolean
  appended: boolean
}

export type use_action_realtime_input = {
  owner: action_realtime_owner
  room_uuid: string
  active_room_uuid?: string | null
  enabled?: boolean
  source_channel?: string | null
  on_action: (
    action: chat_action_realtime_payload,
    inserted_index: number,
  ) => action_realtime_append_result | void
}

type action_realtime_debug_event =
  | 'action_realtime_mounted'
  | 'action_realtime_subscribe_started'
  | 'action_realtime_subscribe_status'
  | 'action_realtime_payload_received'
  | 'action_realtime_payload_accepted'
  | 'action_realtime_payload_ignored'
  | 'action_realtime_rendered'

type action_realtime_debug_payload = {
  owner: action_realtime_owner
  room_uuid: string
  active_room_uuid: string
  action_uuid?: string | null
  ignored_reason?: string | null
  prev_count?: number | null
  next_count?: number | null
  subscribe_status?: string | null
  error_message?: string | null
}

function listener_scope_for_owner(
  owner: action_realtime_owner,
): chat_actions_realtime_scope {
  return owner === 'admin' ? 'admin_active' : 'user_active'
}

function emit_action_realtime_debug(
  event: action_realtime_debug_event,
  payload: action_realtime_debug_payload,
) {
  send_chat_realtime_debug({
    category: 'chat_realtime',
    event,
    owner: payload.owner,
    room_uuid: payload.room_uuid,
    active_room_uuid: payload.active_room_uuid,
    action_uuid: payload.action_uuid ?? null,
    payload_action_uuid: payload.action_uuid ?? null,
    ignored_reason: payload.ignored_reason ?? null,
    prev_count: payload.prev_count ?? null,
    next_count: payload.next_count ?? null,
    subscribe_status: payload.subscribe_status ?? null,
    subscription_status: payload.subscribe_status ?? null,
    error_message: payload.error_message ?? null,
    phase: 'use_action_realtime',
  })
}

export function use_action_realtime(input: use_action_realtime_input) {
  const on_action_ref = useRef(input.on_action)
  const mount_debug_key_ref = useRef<string | null>(null)

  useEffect(() => {
    on_action_ref.current = input.on_action
  }, [input.on_action])

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

    emit_action_realtime_debug('action_realtime_mounted', {
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

    emit_action_realtime_debug('action_realtime_subscribe_started', {
      owner,
      room_uuid,
      active_room_uuid,
      subscribe_status: 'SUBSCRIBE_REQUESTED',
    })

    const supabase = create_browser_supabase()

    if (!supabase) {
      emit_action_realtime_debug('action_realtime_subscribe_status', {
        owner,
        room_uuid,
        active_room_uuid,
        subscribe_status: 'SUPABASE_CLIENT_UNAVAILABLE',
        error_message: 'create_browser_supabase_returned_null',
        ignored_reason: 'supabase_client_unavailable',
      })

      return
    }

    const channel = subscribe_chat_actions_realtime({
      supabase,
      room_uuid,
      scope: listener_scope,
      source_channel,
      on_subscribed: () => {
        emit_action_realtime_debug('action_realtime_subscribe_status', {
          owner,
          room_uuid,
          active_room_uuid,
          subscribe_status: 'SUBSCRIBED',
        })
      },
      on_action: (action, inserted_index) => {
        emit_action_realtime_debug('action_realtime_payload_received', {
          owner,
          room_uuid,
          active_room_uuid,
          action_uuid: action.action_uuid,
        })

        const action_room = action.room_uuid.trim()

        if (action_room !== active_room_uuid) {
          emit_action_realtime_debug('action_realtime_payload_ignored', {
            owner,
            room_uuid,
            active_room_uuid,
            action_uuid: action.action_uuid,
            ignored_reason: 'payload_room_uuid_mismatch',
          })

          return
        }

        if (
          !chat_action_visible_to_listener_scope({
            action_type: action.action_type,
            visibility: null,
            scope: listener_scope,
          })
        ) {
          emit_action_realtime_debug('action_realtime_payload_ignored', {
            owner,
            room_uuid,
            active_room_uuid,
            action_uuid: action.action_uuid,
            ignored_reason: 'action_not_visible_to_listener',
          })

          return
        }

        emit_action_realtime_debug('action_realtime_payload_accepted', {
          owner,
          room_uuid,
          active_room_uuid,
          action_uuid: action.action_uuid,
        })

        const append_result = on_action_ref.current(action, inserted_index)

        if (append_result && append_result.appended) {
          emit_action_realtime_debug('action_realtime_rendered', {
            owner,
            room_uuid,
            active_room_uuid,
            action_uuid: action.action_uuid,
            prev_count: append_result.prev_count,
            next_count: append_result.next_count,
          })
        }
      },
    })

    return () => {
      cleanup_chat_actions_realtime({
        supabase,
        channel,
        room_uuid,
        scope: listener_scope,
        cleanup_reason: 'use_action_realtime_cleanup',
      })
    }
  }, [
    active_room_uuid,
    enabled,
    listener_scope,
    owner,
    room_uuid,
    source_channel,
  ])
}
