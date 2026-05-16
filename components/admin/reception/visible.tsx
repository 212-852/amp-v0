'use client'

import Link from 'next/link'
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react'

import AdminChat from '@/components/admin/chat'
import AdminHandoffMemo from '@/components/admin/memo'
import AdminReceptionActiveSummary from '@/components/admin/reception/active_summary'
import {
  append_admin_reception_timeline_messages,
  get_admin_reception_messages_channel,
  get_admin_reception_timeline_snapshot,
  reset_admin_reception_timeline,
  subscribe_admin_reception_timeline,
} from '@/components/admin/reception/detail_state'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { handoff_memo } from '@/lib/chat/handoff'
import type { reception_room } from '@/lib/admin/reception/types'
import type { reception_room_message } from '@/lib/admin/reception/types'
import type { chat_room_timeline_message } from '@/lib/chat/timeline_display'

export type admin_reception_visible_props = {
  room: reception_room | null
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string
  customer_display_name: string
  staff_user_uuid: string | null
  staff_tier: string | null
  staff_participant_uuid: string
  staff_display_name: string
  memos: handoff_memo[]
  messages: reception_room_message[]
  load_failed: boolean
}

const component_file = 'components/admin/reception/visible.tsx'

export default function AdminReceptionVisible(props: admin_reception_visible_props) {
  const room_uuid = (props.room?.room_uuid ?? props.room_uuid ?? '').trim()
  const visible_rendered_ref = useRef<string | null>(null)
  const messages_channel_ref = useRef(get_admin_reception_messages_channel())

  const subscribe_timeline = useCallback(
    (on_store_change: () => void) => subscribe_admin_reception_timeline(on_store_change),
    [],
  )

  const get_timeline = useCallback(
    () => get_admin_reception_timeline_snapshot(),
    [],
  )

  const live_messages = useSyncExternalStore(subscribe_timeline, get_timeline, get_timeline)

  useLayoutEffect(() => {
    reset_admin_reception_timeline(props.messages)
  }, [props.messages, props.room_uuid])

  useLayoutEffect(() => {
    messages_channel_ref.current = get_admin_reception_messages_channel()
  })

  useLayoutEffect(() => {
    if (!room_uuid || visible_rendered_ref.current === room_uuid) {
      return
    }

    visible_rendered_ref.current = room_uuid

    send_admin_chat_debug({
      event: 'admin_reception_room_rendered',
      room_uuid,
      active_room_uuid: room_uuid,
      admin_user_uuid: props.admin_user_uuid.trim() || null,
      admin_participant_uuid: props.admin_participant_uuid.trim() || null,
      component_file,
      pathname: `/admin/reception/${room_uuid}`,
      phase: 'admin_reception_visible',
    })
  }, [props.admin_participant_uuid, props.admin_user_uuid, room_uuid])

  const append_live_timeline_messages = useCallback(
    (addition: chat_room_timeline_message[]) => {
      append_admin_reception_timeline_messages(addition)
    },
    [],
  )

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
              room_uuid={room_uuid}
              room={props.room}
              customer_display_name={props.customer_display_name}
              staff_user_uuid={props.staff_user_uuid}
              staff_tier={props.staff_tier}
              staff_participant_uuid={props.staff_participant_uuid}
            />
            <AdminHandoffMemo
              room_uuid={room_uuid}
              initial_memos={props.memos}
            />
          </div>
        </div>

        <AdminChat
          key={room_uuid}
          messages={live_messages}
          load_failed={props.load_failed}
          room_uuid={room_uuid}
          staff_participant_uuid={props.staff_participant_uuid}
          staff_display_name={props.staff_display_name}
          staff_user_uuid={props.staff_user_uuid}
          staff_tier={props.staff_tier}
          room_display_title={props.customer_display_name}
          admin_user_uuid={props.admin_user_uuid}
          admin_participant_uuid={props.admin_participant_uuid}
          realtime_messages_channel_ref={messages_channel_ref}
          on_append_timeline_messages={append_live_timeline_messages}
          disable_message_realtime
        />
      </section>
    </div>
  )
}
