'use client'

import Link from 'next/link'
import type { RefObject } from 'react'

import AdminChat from '@/components/admin/chat'
import AdminHandoffMemo from '@/components/admin/memo'
import AdminReceptionActiveSummary from '@/components/admin/reception/active_summary'
import type { admin_reception_room_shell_props } from '@/components/admin/reception/room_props'
import type { chat_room_timeline_message } from '@/lib/chat/timeline_display'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type admin_reception_room_interior_props = admin_reception_room_shell_props & {
  live_messages: chat_room_timeline_message[]
  realtime_messages_channel_ref: RefObject<RealtimeChannel | null>
  append_live_timeline_messages: (addition: chat_room_timeline_message[]) => void
}

export default function AdminReceptionRoomInterior(
  props: admin_reception_room_interior_props,
) {
  return (
    <div className="-mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <header className="shrink-0 border-b border-neutral-200 bg-white px-6 py-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-500"
        >
          <Link href="/admin" className="transition-colors hover:text-black">
            Home
          </Link>
          <span aria-hidden>{'>'}</span>
          <Link
            href="/admin/reception"
            className="transition-colors hover:text-black"
          >
            チャット一覧
          </Link>
          <span aria-hidden>{'>'}</span>
          <span className="truncate text-neutral-900">
            {props.customer_display_name}
          </span>
        </nav>
      </header>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="shrink-0 border-b border-neutral-200 px-6 py-4">
          <div className="flex flex-col gap-3">
            <AdminReceptionActiveSummary
              room_uuid={props.room_uuid}
              room={props.room}
              customer_display_name={props.customer_display_name}
              staff_user_uuid={props.staff_user_uuid}
              staff_tier={props.staff_tier}
              staff_participant_uuid={props.staff_participant_uuid}
            />
            <AdminHandoffMemo
              room_uuid={props.room_uuid}
              initial_memos={props.memos}
            />
          </div>
        </div>

        <AdminChat
          key={props.room_uuid}
          messages={props.live_messages}
          load_failed={props.load_failed}
          room_uuid={props.room_uuid}
          staff_participant_uuid={props.staff_participant_uuid}
          staff_display_name={props.staff_display_name}
          staff_user_uuid={props.staff_user_uuid}
          staff_tier={props.staff_tier}
          room_display_title={props.customer_display_name}
          admin_user_uuid={props.admin_user_uuid}
          admin_participant_uuid={props.admin_participant_uuid}
          realtime_messages_channel_ref={props.realtime_messages_channel_ref}
          on_append_timeline_messages={props.append_live_timeline_messages}
        />
      </section>
    </div>
  )
}
