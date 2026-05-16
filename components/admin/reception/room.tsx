'use client'

import dynamic from 'next/dynamic'
import { useLayoutEffect, useRef } from 'react'

import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { admin_reception_room_shell_props } from '@/components/admin/reception/room_props'

export type { admin_reception_room_shell_props as AdminReceptionRoomProps } from '@/components/admin/reception/room_props'

const AdminReceptionLive = dynamic(
  () => import('@/components/admin/reception/live'),
  { ssr: false },
)

const component_file = 'components/admin/reception/room.tsx'

export default function AdminReceptionRoom(props: admin_reception_room_shell_props) {
  const room_uuid = (props.room_uuid ?? props.room?.room_uuid ?? '').trim()
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

  return <AdminReceptionLive {...props} room_uuid={room_uuid} />
}
