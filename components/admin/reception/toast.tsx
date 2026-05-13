'use client'

import { useEffect, useMemo } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { use_session_profile } from '@/components/session/profile'
import {
  cleanup_chat_room_realtime,
  subscribe_chat_room_realtime,
} from '@/lib/chat/realtime/client'
import { resolve_realtime_message_subtitle_for_toast } from '@/lib/chat/realtime/toast_decision'
import { create_browser_supabase } from '@/lib/db/browser'
import { handle_chat_message_toast } from '@/lib/output/toast'

type admin_reception_toast_room_row = {
  room_uuid: string
  title: string
  display_name: string
}

type AdminReceptionToastListenerProps = {
  rooms: admin_reception_toast_room_row[]
}

export default function AdminReceptionToastListener({
  rooms,
}: AdminReceptionToastListenerProps) {
  const { session } = use_session_profile()
  const room_uuids = useMemo(
    () => Array.from(new Set(rooms.map((room) => room.room_uuid))).sort(),
    [rooms],
  )
  const room_key = room_uuids.join(',')

  useEffect(() => {
    if (session?.role !== 'admin' || room_uuids.length === 0) {
      return
    }

    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const channels: RealtimeChannel[] = []

    room_uuids.forEach((room_uuid) => {
      const room_row = rooms.find((row) => row.room_uuid === room_uuid)
      const list_title =
        room_row?.title?.trim() ||
        room_row?.display_name?.trim() ||
        room_uuid.slice(0, 8)

      const channel = subscribe_chat_room_realtime({
        supabase,
        room_uuid,
        active_room_uuid: null,
        participant_uuid: null,
        user_uuid: session.user_uuid ?? null,
        role: 'admin',
        tier: session.tier ?? null,
        source_channel: 'admin',
        on_message: (message) => {
          handle_chat_message_toast({
            room_uuid: message.room_uuid,
            active_room_uuid: null,
            message_uuid: message.archive_uuid,
            sender_user_uuid: message.sender_user_uuid ?? null,
            sender_participant_uuid: message.sender_participant_uuid ?? null,
            sender_role: message.sender_role ?? message.bundle.sender ?? null,
            active_user_uuid: session.user_uuid ?? null,
            active_participant_uuid: null,
            active_role: 'admin',
            role: 'admin',
            tier: session.tier ?? null,
            source_channel: 'admin',
            target_path: `/admin/reception/${message.room_uuid}`,
            phase: 'admin_chat_list_realtime_message',
            is_scrolled_to_bottom: null,
            subtitle: resolve_realtime_message_subtitle_for_toast(
              message,
              list_title,
            ),
            scroll_to_bottom: null,
          })
        },
        on_typing: () => {},
      })

      channels.push(channel)
    })

    return () => {
      channels.forEach((channel, index) => {
        cleanup_chat_room_realtime({
          supabase,
          channel,
          room_uuid: room_uuids[index] ?? '',
          active_room_uuid: null,
          participant_uuid: null,
          user_uuid: session.user_uuid ?? null,
          role: 'admin',
          tier: session.tier ?? null,
          source_channel: 'admin',
          cleanup_reason: 'admin_chat_list_unmount',
        })
      })
    }
  }, [room_key, room_uuids, rooms, session?.role, session?.tier, session?.user_uuid])

  return null
}
