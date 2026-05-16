'use client'

import { useLayoutEffect, useRef } from 'react'

import AdminReceptionLive from '@/components/admin/reception/live'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { admin_reception_room_shell_props } from '@/components/admin/reception/room_props'

const component_file = 'components/admin/reception/room/client.tsx'

export type { admin_reception_room_shell_props as AdminReceptionRoomProps } from '@/components/admin/reception/room_props'

export default function AdminReceptionRoom(props: admin_reception_room_shell_props) {
  const room_uuid = (props.room?.room_uuid ?? props.room_uuid ?? '').trim()
  const room_rendered_debug_ref = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!room_uuid || room_rendered_debug_ref.current === room_uuid) {
      return
    }

    room_rendered_debug_ref.current = room_uuid

    send_admin_chat_debug({
      event: 'admin_reception_room_rendered',
      room_uuid,
      active_room_uuid: room_uuid,
      admin_user_uuid: props.admin_user_uuid.trim() || null,
      admin_participant_uuid: props.admin_participant_uuid.trim() || null,
      component_file,
      pathname: `/admin/reception/${room_uuid}`,
      phase: 'admin_reception_room',
    })
  }, [props.admin_participant_uuid, props.admin_user_uuid, room_uuid])

  return (
    <AdminReceptionLive
      room_uuid={room_uuid}
      room={props.room}
      admin_user_uuid={props.admin_user_uuid}
      admin_participant_uuid={props.admin_participant_uuid}
      customer_display_name={props.customer_display_name}
      staff_user_uuid={props.staff_user_uuid}
      staff_tier={props.staff_tier}
      staff_participant_uuid={props.staff_participant_uuid}
      staff_display_name={props.staff_display_name}
      memos={props.memos}
      messages={props.messages}
      load_failed={props.load_failed}
    />
  )
}
