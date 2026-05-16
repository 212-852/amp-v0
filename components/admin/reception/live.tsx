'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'

import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import {
  use_chat_realtime,
  type chat_realtime_hook_append_result,
} from '@/lib/chat/realtime/use_chat_realtime'
import { use_support_lifecycle } from '@/lib/support/lifecycle/client'

const component_file = 'components/admin/reception/live.tsx'

const noop_append: chat_realtime_hook_append_result = {
  prev_count: 0,
  next_count: 0,
  dedupe_hit: true,
}

const support_action_listeners = new Set<
  (action: chat_action_realtime_payload) => void
>()

const message_listeners = new Set<
  (
    message: realtime_archived_message,
  ) => chat_realtime_hook_append_result | void
>()

const action_listeners = new Set<
  (
    action: chat_action_realtime_payload,
    inserted_index: number,
  ) => chat_realtime_hook_append_result | void
>()

export function register_admin_reception_live_support_action(
  listener: (action: chat_action_realtime_payload) => void,
) {
  support_action_listeners.add(listener)

  return () => {
    support_action_listeners.delete(listener)
  }
}

export function register_admin_reception_live_message(
  listener: (
    message: realtime_archived_message,
  ) => chat_realtime_hook_append_result | void,
) {
  message_listeners.add(listener)

  return () => {
    message_listeners.delete(listener)
  }
}

export function register_admin_reception_live_action(
  listener: (
    action: chat_action_realtime_payload,
    inserted_index: number,
  ) => chat_realtime_hook_append_result | void,
) {
  action_listeners.add(listener)

  return () => {
    action_listeners.delete(listener)
  }
}

export type admin_reception_live_props = {
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string
  staff_user_uuid?: string | null
  staff_tier?: string | null
  staff_participant_uuid?: string
  enabled?: boolean
  on_support_action?: (action: chat_action_realtime_payload) => void
  on_message?: (
    message: realtime_archived_message,
  ) => chat_realtime_hook_append_result | void
  on_action?: (
    action: chat_action_realtime_payload,
    inserted_index: number,
  ) => chat_realtime_hook_append_result | void
}

export default function AdminReceptionLive(props: admin_reception_live_props) {
  const live_mounted_room_ref = useRef<string | null>(null)
  const room_uuid = props.room_uuid.trim()
  const enabled = props.enabled !== false && Boolean(room_uuid)
  const staff_participant_uuid = (
    props.staff_participant_uuid ?? props.admin_participant_uuid
  ).trim()
  const staff_user_uuid = (props.staff_user_uuid ?? props.admin_user_uuid).trim()

  const on_support_action = useCallback(
    (action: chat_action_realtime_payload) => {
      props.on_support_action?.(action)

      for (const listener of support_action_listeners) {
        listener(action)
      }
    },
    [props.on_support_action],
  )

  const on_message = useCallback(
    (message: realtime_archived_message) => {
      let result = props.on_message?.(message)

      for (const listener of message_listeners) {
        result = listener(message) ?? result
      }

      return result ?? noop_append
    },
    [props.on_message],
  )

  const on_action = useCallback(
    (action: chat_action_realtime_payload, inserted_index: number) => {
      let result = props.on_action?.(action, inserted_index)

      for (const listener of action_listeners) {
        result = listener(action, inserted_index) ?? result
      }

      return result ?? noop_append
    },
    [props.on_action],
  )

  useLayoutEffect(() => {
    if (!room_uuid || live_mounted_room_ref.current === room_uuid) {
      return
    }

    live_mounted_room_ref.current = room_uuid

    send_admin_chat_debug({
      event: 'admin_reception_live_mounted',
      room_uuid,
      active_room_uuid: room_uuid,
      admin_user_uuid: props.admin_user_uuid.trim() || null,
      admin_participant_uuid: props.admin_participant_uuid.trim() || null,
      component_file,
      phase: 'admin_reception_live',
    })
  }, [props.admin_participant_uuid, props.admin_user_uuid, room_uuid])

  use_support_lifecycle({
    room_uuid,
    admin_user_uuid: props.admin_user_uuid,
    admin_participant_uuid: props.admin_participant_uuid,
    on_support_action,
  })

  use_chat_realtime({
    owner: 'admin',
    room_uuid,
    active_room_uuid: room_uuid,
    enabled,
    participant_uuid: staff_participant_uuid,
    user_uuid: staff_user_uuid || null,
    role: 'admin',
    tier: props.staff_tier ?? null,
    source_channel: 'admin',
    receiver_participant_uuid: staff_participant_uuid,
    on_message,
    on_action,
  })

  return null
}
