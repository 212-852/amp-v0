'use client'

import { useEffect } from 'react'

import AdminChatTimeline from '@/components/admin/c'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { chat_room_timeline_message } from '@/lib/chat/timeline_display'

type AdminChatProps = {
  messages: chat_room_timeline_message[]
  load_failed: boolean
  room_uuid: string
  staff_participant_uuid: string
  staff_display_name: string
  staff_user_uuid: string | null
  staff_tier: string | null
  room_display_title: string
}

const component_file = 'components/admin/chat.tsx'

export default function AdminChat(props: AdminChatProps) {
  useEffect(() => {
    send_admin_chat_debug({
      event: 'admin_chat_component_mounted',
      room_uuid: props.room_uuid,
      active_room_uuid: props.room_uuid,
      admin_user_uuid: props.staff_user_uuid,
      admin_participant_uuid: props.staff_participant_uuid,
      component_file,
      phase: 'admin_chat_shell',
    })
  }, [props.room_uuid, props.staff_participant_uuid, props.staff_user_uuid])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      send_admin_chat_debug({
        event: 'admin_chat_component_ready',
        room_uuid: props.room_uuid,
        active_room_uuid: props.room_uuid,
        admin_user_uuid: props.staff_user_uuid,
        admin_participant_uuid: props.staff_participant_uuid,
        component_file,
        phase: 'admin_chat_shell',
      })
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [props.room_uuid, props.staff_participant_uuid, props.staff_user_uuid])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminChatTimeline {...props} />
    </div>
  )
}
