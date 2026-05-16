'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import {
  use_chat_realtime,
  type chat_realtime_hook_append_result,
} from '@/lib/chat/realtime/use_chat_realtime'
import { use_support_lifecycle } from '@/lib/support/lifecycle/client'

const component_file = 'components/admin/reception/live.tsx'

export type admin_reception_live_props = {
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string
  staff_user_uuid: string | null
  staff_tier: string | null
  staff_participant_uuid: string
  enabled?: boolean
  export_messages_channel_ref?: RefObject<RealtimeChannel | null>
  on_message: (
    message: realtime_archived_message,
  ) => chat_realtime_hook_append_result | void
  on_action: (
    action: chat_action_realtime_payload,
    inserted_index: number,
  ) => chat_realtime_hook_append_result | void
  on_support_action: (action: chat_action_realtime_payload) => void
}

export default function AdminReceptionLive(props: admin_reception_live_props) {
  const live_mounted_room_ref = useRef<string | null>(null)
  const room_uuid = props.room_uuid.trim()
  const enabled = props.enabled !== false && Boolean(room_uuid)

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
    on_support_action: props.on_support_action,
  })

  use_chat_realtime({
    owner: 'admin',
    room_uuid,
    active_room_uuid: room_uuid,
    enabled,
    participant_uuid: props.staff_participant_uuid,
    user_uuid: props.staff_user_uuid,
    role: 'admin',
    tier: props.staff_tier,
    source_channel: 'admin',
    receiver_participant_uuid: props.staff_participant_uuid,
    export_messages_channel_ref: props.export_messages_channel_ref,
    on_message: props.on_message,
    on_action: props.on_action,
  })

  return null
}
