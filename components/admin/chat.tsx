'use client'

import { useEffect, useState } from 'react'

import AdminChatTimeline from '@/components/admin/c'
import { render_debug } from '@/lib/debug/render'
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
  const [debug_tick, set_debug_tick] = useState(0)

  useEffect(() => {
    console.log('ADMIN_CHAT_MOUNTED')
    render_debug({
      category: 'ADMIN_CHAT',
      event: 'admin_chat_mounted',
      level: 'info',
      payload: {
        room_uuid: props.room_uuid,
        active_room_uuid: props.room_uuid,
        admin_user_uuid: props.staff_user_uuid,
        admin_participant_uuid: props.staff_participant_uuid,
        component_file,
      },
    })
  }, [props.room_uuid, props.staff_participant_uuid, props.staff_user_uuid])

  useEffect(() => {
    const id = window.setInterval(() => {
      set_debug_tick((value) => value + 1)
    }, 1_000)

    return () => {
      window.clearInterval(id)
    }
  }, [])

  return (
    <div data-debug-component={component_file}>
      <div>DEBUG_ADMIN_CHAT_COMPONENT_components/admin/chat.tsx</div>
      <div>DEBUG_TICK_{debug_tick}</div>
      <AdminChatTimeline {...props} />
    </div>
  )
}
