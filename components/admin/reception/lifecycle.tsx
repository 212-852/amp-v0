'use client'

import { useCallback } from 'react'

import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import { use_support_lifecycle } from '@/lib/support/lifecycle/client'

export type admin_reception_lifecycle_props = {
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string
}

export default function AdminReceptionLifecycle(
  props: admin_reception_lifecycle_props,
) {
  const on_support_action = useCallback(
    (_action: chat_action_realtime_payload) => {},
    [],
  )

  use_support_lifecycle({
    room_uuid: props.room_uuid,
    admin_user_uuid: props.admin_user_uuid,
    admin_participant_uuid: props.admin_participant_uuid,
    on_support_action,
  })

  return null
}
