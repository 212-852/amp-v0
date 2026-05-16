'use client'

import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { create_browser_supabase } from '@/lib/db/browser'

import {
  chat_action_visible_to_listener_scope,
  cleanup_chat_actions_realtime,
  subscribe_chat_actions_realtime,
  type chat_action_realtime_payload,
  type chat_actions_realtime_scope,
} from './chat_actions'
import {
  cleanup_chat_room_realtime,
  send_chat_realtime_debug,
  subscribe_chat_room_realtime,
  type chat_presence_payload,
  type chat_typing_payload,
} from './client'
import {
  evaluate_realtime_message_acceptance,
  resolve_realtime_message_channels,
} from './messages_client'
import type { realtime_archived_message } from './row'

export type chat_realtime_hook_owner = 'admin' | 'user'

export type chat_realtime_hook_append_result = {
  prev_count: number
  next_count: number
  dedupe_hit: boolean
}

export type use_chat_realtime_input = {
  owner: chat_realtime_hook_owner
  room_uuid: string
  active_room_uuid?: string | null
  enabled?: boolean
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: string | null
  receiver_participant_uuid?: string | null
  active_typing_identity_ref?: MutableRefObject<{
    user_uuid: string | null
    participant_uuid: string | null
    role: string | null
  }>
  on_message: (
    message: realtime_archived_message,
  ) => chat_realtime_hook_append_result | void
  on_action: (
    action: chat_action_realtime_payload,
    inserted_index: number,
  ) => chat_realtime_hook_append_result | void
  on_typing?: (payload: chat_typing_payload) => void
  on_presence?: (payload: chat_presence_payload) => void
  /** Exposes the messages realtime channel for typing broadcast (single subscribe). */
  export_messages_channel_ref?: MutableRefObject<RealtimeChannel | null>
}

type hook_debug_payload = {
  owner: chat_realtime_hook_owner
  room_uuid: string | null
  active_room_uuid: string | null
  message_uuid?: string | null
  action_uuid?: string | null
  source_channel?: string | null
  direction?: string | null
  ignored_reason?: string | null
  prev_count?: number | null
  next_count?: number | null
  subscribe_status?: string | null
  subscription_status?: string | null
  error_message?: string | null
}

function listener_scope_for_owner(
  owner: chat_realtime_hook_owner,
): chat_actions_realtime_scope {
  return owner === 'admin' ? 'admin_active' : 'user_active'
}

function emit_chat_realtime_hook_debug(
  event:
    | 'chat_realtime_hook_mounted'
    | 'chat_realtime_subscribe_started'
    | 'chat_realtime_subscribe_status'
    | 'chat_realtime_message_received'
    | 'chat_realtime_message_accepted'
    | 'chat_realtime_message_ignored'
    | 'chat_realtime_action_received'
    | 'chat_realtime_action_accepted'
    | 'chat_realtime_action_ignored'
    | 'chat_realtime_state_append_succeeded'
    | 'chat_realtime_message_rendered',
  payload: hook_debug_payload,
) {
  send_chat_realtime_debug({
    category: 'chat_realtime',
    event,
    owner: payload.owner,
    room_uuid: payload.room_uuid,
    active_room_uuid: payload.active_room_uuid,
    message_uuid: payload.message_uuid ?? null,
    payload_message_uuid: payload.message_uuid ?? null,
    action_uuid: payload.action_uuid ?? null,
    payload_action_uuid: payload.action_uuid ?? null,
    source_channel: payload.source_channel ?? null,
    direction: payload.direction ?? null,
    payload_source_channel: payload.source_channel ?? null,
    payload_direction: payload.direction ?? null,
    ignored_reason: payload.ignored_reason ?? null,
    prev_count: payload.prev_count ?? null,
    next_count: payload.next_count ?? null,
    prev_message_count: payload.prev_count ?? null,
    next_message_count: payload.next_count ?? null,
    subscribe_status: payload.subscribe_status ?? payload.subscription_status ?? null,
    subscription_status:
      payload.subscription_status ?? payload.subscribe_status ?? null,
    error_message: payload.error_message ?? null,
    phase: 'use_chat_realtime',
  })
}

export function use_chat_realtime(input: use_chat_realtime_input) {
  const messages_channel_ref = useRef<RealtimeChannel | null>(null)
  const actions_channel_ref = useRef<RealtimeChannel | null>(null)
  const on_message_ref = useRef(input.on_message)
  const on_action_ref = useRef(input.on_action)
  const on_typing_ref = useRef(input.on_typing)
  const on_presence_ref = useRef(input.on_presence)
  const mount_debug_key_ref = useRef<string | null>(null)

  useEffect(() => {
    on_message_ref.current = input.on_message
  }, [input.on_message])

  useEffect(() => {
    on_action_ref.current = input.on_action
  }, [input.on_action])

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
  const source_channel = input.source_channel ?? (owner === 'admin' ? 'admin' : 'web')

  useLayoutEffect(() => {
    if (!enabled) {
      return
    }

    const mount_key = `${owner}:${room_uuid}`

    if (mount_debug_key_ref.current === mount_key) {
      return
    }

    mount_debug_key_ref.current = mount_key

    emit_chat_realtime_hook_debug('chat_realtime_hook_mounted', {
      owner,
      room_uuid,
      active_room_uuid,
      subscription_status: 'HOOK_MOUNTED',
    })
  }, [active_room_uuid, enabled, owner, room_uuid])

  useEffect(() => {
    if (!enabled) {
      return
    }

    emit_chat_realtime_hook_debug('chat_realtime_subscribe_started', {
      owner,
      room_uuid,
      active_room_uuid,
      source_channel,
      subscription_status: 'SUBSCRIBE_REQUESTED',
    })

    const supabase = create_browser_supabase()

    if (!supabase) {
      emit_chat_realtime_hook_debug('chat_realtime_subscribe_status', {
        owner,
        room_uuid,
        active_room_uuid,
        subscribe_status: 'SUPABASE_CLIENT_UNAVAILABLE',
        subscription_status: 'SUPABASE_CLIENT_UNAVAILABLE',
        error_message: 'create_browser_supabase_returned_null',
        ignored_reason: 'supabase_client_unavailable',
      })

      return
    }

    let messages_subscribed = false
    let actions_subscribed = false

    const messages_channel = subscribe_chat_room_realtime({
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
        emit_chat_realtime_hook_debug('chat_realtime_subscribe_status', {
          owner,
          room_uuid,
          active_room_uuid,
          subscribe_status: status,
          subscription_status: status,
          error_message,
        })
      },
      on_message: (message) => {
        const channels = resolve_realtime_message_channels(message)
        const payload_room_uuid = (message.room_uuid ?? '').trim()

        emit_chat_realtime_hook_debug('chat_realtime_message_received', {
          owner,
          room_uuid,
          active_room_uuid,
          message_uuid: message.archive_uuid,
          source_channel: channels.source_channel,
          direction: channels.direction,
        })

        const acceptance = evaluate_realtime_message_acceptance({
          payload_room_uuid,
          active_room_uuid,
          message,
        })

        if (!acceptance.accept) {
          emit_chat_realtime_hook_debug('chat_realtime_message_ignored', {
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

        emit_chat_realtime_hook_debug('chat_realtime_message_accepted', {
          owner,
          room_uuid,
          active_room_uuid,
          message_uuid: message.archive_uuid,
          source_channel: channels.source_channel,
          direction: channels.direction,
        })

        const append_result = on_message_ref.current(message)

        if (append_result && !append_result.dedupe_hit) {
          if (append_result.next_count > append_result.prev_count) {
            emit_chat_realtime_hook_debug('chat_realtime_state_append_succeeded', {
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

          emit_chat_realtime_hook_debug('chat_realtime_message_rendered', {
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

    messages_channel_ref.current = messages_channel

    if (input.export_messages_channel_ref) {
      input.export_messages_channel_ref.current = messages_channel
    }

    messages_subscribed = true

    const actions_channel = subscribe_chat_actions_realtime({
      supabase,
      room_uuid,
      scope: listener_scope,
      source_channel,
      on_action: (action, inserted_index) => {
        emit_chat_realtime_hook_debug('chat_realtime_action_received', {
          owner,
          room_uuid,
          active_room_uuid,
          action_uuid: action.action_uuid,
          source_channel,
        })

        const action_room = action.room_uuid.trim()

        if (action_room !== active_room_uuid) {
          emit_chat_realtime_hook_debug('chat_realtime_action_ignored', {
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
          emit_chat_realtime_hook_debug('chat_realtime_action_ignored', {
            owner,
            room_uuid,
            active_room_uuid,
            action_uuid: action.action_uuid,
            ignored_reason: 'action_not_visible_to_listener',
          })

          return
        }

        emit_chat_realtime_hook_debug('chat_realtime_action_accepted', {
          owner,
          room_uuid,
          active_room_uuid,
          action_uuid: action.action_uuid,
          source_channel,
        })

        const append_result = on_action_ref.current(action, inserted_index)

        if (
          append_result &&
          !append_result.dedupe_hit &&
          append_result.next_count > append_result.prev_count
        ) {
          emit_chat_realtime_hook_debug('chat_realtime_state_append_succeeded', {
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

    actions_channel_ref.current = actions_channel
    actions_subscribed = true

    return () => {
      if (messages_subscribed && messages_channel) {
        cleanup_chat_room_realtime({
          supabase,
          channel: messages_channel,
          room_uuid,
          active_room_uuid,
          participant_uuid: input.participant_uuid ?? null,
          user_uuid: input.user_uuid ?? null,
          role: input.role ?? null,
          tier: input.tier ?? null,
          source_channel,
          cleanup_reason: 'use_chat_realtime_cleanup',
        })
      }

      if (actions_subscribed && actions_channel) {
        cleanup_chat_actions_realtime({
          supabase,
          channel: actions_channel,
          room_uuid,
          scope: listener_scope,
          cleanup_reason: 'use_chat_realtime_cleanup',
        })
      }

      if (messages_channel_ref.current === messages_channel) {
        messages_channel_ref.current = null
      }

      if (input.export_messages_channel_ref?.current === messages_channel) {
        input.export_messages_channel_ref.current = null
      }

      if (actions_channel_ref.current === actions_channel) {
        actions_channel_ref.current = null
      }
    }
  }, [
    active_room_uuid,
    enabled,
    input.active_typing_identity_ref,
    input.participant_uuid,
    input.role,
    input.room_uuid,
    input.tier,
    input.export_messages_channel_ref,
    input.user_uuid,
    listener_scope,
    owner,
    room_uuid,
    source_channel,
  ])

  return {
    messages_channel_ref,
    actions_channel_ref,
  }
}
