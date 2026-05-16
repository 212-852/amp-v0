'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'

import {
  append_admin_reception_realtime_action,
  append_admin_reception_realtime_message,
  set_admin_reception_messages_channel,
} from '@/components/admin/reception/detail_state'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import { send_chat_realtime_debug } from '@/lib/chat/realtime/client'
import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import { use_action_realtime } from '@/lib/chat/realtime/use_action_realtime'
import { use_message_realtime } from '@/lib/chat/realtime/use_message_realtime'
import { use_support_lifecycle } from '@/lib/support/lifecycle/client'

const component_file = 'components/admin/reception/runtime.tsx'

export type admin_reception_runtime_props = {
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string
  staff_user_uuid?: string | null
  staff_tier?: string | null
  staff_participant_uuid?: string
}

export default function AdminReceptionRuntime(props: admin_reception_runtime_props) {
  const runtime_mounted_ref = useRef<string | null>(null)
  const room_uuid = props.room_uuid.trim()
  const enabled = Boolean(room_uuid)
  const staff_participant_uuid = (
    props.staff_participant_uuid ?? props.admin_participant_uuid
  ).trim()
  const staff_user_uuid = (props.staff_user_uuid ?? props.admin_user_uuid).trim()

  useLayoutEffect(() => {
    if (!room_uuid || runtime_mounted_ref.current === room_uuid) {
      return
    }

    runtime_mounted_ref.current = room_uuid

    send_admin_chat_debug({
      event: 'admin_reception_runtime_mounted',
      room_uuid,
      active_room_uuid: room_uuid,
      admin_user_uuid: props.admin_user_uuid.trim() || null,
      admin_participant_uuid: props.admin_participant_uuid.trim() || null,
      component_file,
      pathname: `/admin/reception/${room_uuid}`,
      phase: 'admin_reception_runtime',
    })
    send_chat_realtime_debug({
      category: 'chat_realtime',
      event: 'chat_realtime_hook_mounted',
      owner: 'admin',
      room_uuid,
      active_room_uuid: room_uuid,
      subscribe_status: 'HOOK_MOUNTED',
      subscription_status: 'HOOK_MOUNTED',
      phase: 'admin_reception_runtime',
    })
  }, [props.admin_participant_uuid, props.admin_user_uuid, room_uuid])

  const on_support_action = useCallback((action: chat_action_realtime_payload) => {
    append_admin_reception_realtime_action(action)
  }, [])

  const on_message = useCallback((message: realtime_archived_message) => {
    return append_admin_reception_realtime_message(message)
  }, [])

  const on_action = useCallback(
    (action: chat_action_realtime_payload, _inserted_index: number) => {
      return append_admin_reception_realtime_action(action)
    },
    [],
  )

  use_support_lifecycle({
    room_uuid,
    admin_user_uuid: props.admin_user_uuid,
    admin_participant_uuid: props.admin_participant_uuid,
    on_support_action,
  })

  use_message_realtime({
    owner: 'admin',
    room_uuid,
    active_room_uuid: room_uuid,
    enabled,
    participant_uuid: staff_participant_uuid,
    user_uuid: staff_user_uuid || null,
    role: 'admin',
    tier: props.staff_tier ?? null,
    source_channel: 'admin',
    on_messages_channel: set_admin_reception_messages_channel,
    on_message,
  })

  use_action_realtime({
    owner: 'admin',
    room_uuid,
    active_room_uuid: room_uuid,
    enabled,
    source_channel: 'admin',
    on_action,
  })

  return null
}
