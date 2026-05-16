'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import {
  cleanup_chat_actions_realtime,
  subscribe_chat_actions_realtime,
} from '@/lib/chat/realtime/chat_actions'
import { create_browser_supabase } from '@/lib/db/browser'
import { use_support_lifecycle } from '@/lib/support/lifecycle/client'

const component_file = 'components/admin/reception/live.tsx'

export type admin_reception_live_props = {
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string
  enabled?: boolean
  on_support_action: (action: chat_action_realtime_payload) => void
  on_action: (
    action: chat_action_realtime_payload,
    inserted_index: number,
  ) => void
}

export default function AdminReceptionLive(props: admin_reception_live_props) {
  const live_mounted_room_ref = useRef<string | null>(null)
  const on_action_ref = useRef(props.on_action)
  const room_uuid = props.room_uuid.trim()
  const enabled = props.enabled !== false && Boolean(room_uuid)

  useEffect(() => {
    on_action_ref.current = props.on_action
  }, [props.on_action])

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

  useEffect(() => {
    if (!enabled) {
      return
    }

    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const channel = subscribe_chat_actions_realtime({
      supabase,
      room_uuid,
      scope: 'admin_active',
      source_channel: 'admin',
      on_action: (action, inserted_index) => {
        on_action_ref.current(action, inserted_index)
      },
    })

    return () => {
      cleanup_chat_actions_realtime({
        supabase,
        channel,
        room_uuid,
        scope: 'admin_active',
        cleanup_reason: 'admin_reception_live_cleanup',
      })
    }
  }, [enabled, room_uuid])

  return null
}
