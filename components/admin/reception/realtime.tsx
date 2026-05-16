'use client'

import { useCallback, useEffect, useRef } from 'react'

import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { chat_action_realtime_payload } from '@/lib/chat/realtime/chat_actions'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import { use_chat_realtime } from '@/lib/chat/realtime/use_chat_realtime'

const component_file = 'components/admin/reception/realtime.tsx'

export type admin_reception_realtime_props = {
  room_uuid: string
}

export default function AdminReceptionRealtime(
  props: admin_reception_realtime_props,
) {
  const mounted_room_ref = useRef<string | null>(null)
  const room_uuid = props.room_uuid.trim()
  const enabled = Boolean(room_uuid)

  useEffect(() => {
    if (!room_uuid || mounted_room_ref.current === room_uuid) {
      return
    }

    mounted_room_ref.current = room_uuid

    send_admin_chat_debug({
      event: 'chat_realtime_hook_mounted',
      room_uuid,
      active_room_uuid: room_uuid,
      component_file,
      pathname: `/admin/reception/${room_uuid}`,
      phase: 'admin_reception_realtime',
    })
  }, [room_uuid])

  const on_message = useCallback((_message: realtime_archived_message) => {
    return undefined
  }, [])

  const on_action = useCallback(
    (_action: chat_action_realtime_payload, _inserted_index: number) => {
      return undefined
    },
    [],
  )

  use_chat_realtime({
    owner: 'admin',
    room_uuid,
    enabled,
    on_message,
    on_action,
  })

  return null
}
