'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import AdminChat from '@/components/admin/chat'
import AdminHandoffMemo from '@/components/admin/memo'
import AdminReceptionActiveSummary from '@/components/admin/reception/active_summary'
import AdminReceptionLive from '@/components/admin/reception/live'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { handoff_memo } from '@/lib/chat/handoff'
import type {
  reception_room,
  reception_room_message,
} from '@/lib/admin/reception/types'
import {
  append_chat_action_to_admin_timeline,
  emit_chat_action_realtime_rendered,
  type chat_action_realtime_payload,
} from '@/lib/chat/realtime/chat_actions'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import {
  archived_message_to_timeline_message,
  merge_timeline_message_rows,
  type chat_room_timeline_message,
} from '@/lib/chat/timeline_display'
import { handle_chat_message_toast } from '@/lib/output/toast'
import { resolve_realtime_message_subtitle_for_toast } from '@/lib/chat/realtime/toast_decision'

export type AdminReceptionRoomProps = {
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

const component_file = 'components/admin/reception/room.tsx'

export default function AdminReceptionRoom(props: AdminReceptionRoomProps) {
  const room_uuid = (props.room?.room_uuid ?? props.room_uuid ?? '').trim()
  const room_rendered_debug_ref = useRef<string | null>(null)
  const [live_messages, set_live_messages] = useState<chat_room_timeline_message[]>(
    () => props.messages,
  )
  const realtime_messages_channel_ref = useRef<RealtimeChannel | null>(null)
  const room_display_title_ref = useRef(props.customer_display_name)

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

  useEffect(() => {
    room_display_title_ref.current = props.customer_display_name
  }, [props.customer_display_name])

  useEffect(() => {
    set_live_messages(
      merge_timeline_message_rows([], props.messages, 'initial_fetch').rows,
    )
  }, [props.messages, props.room_uuid])

  const handle_support_action = useCallback(
    (action: chat_action_realtime_payload) => {
      if (action.room_uuid.trim() !== room_uuid) {
        return
      }

      set_live_messages((previous) => {
        const merged = append_chat_action_to_admin_timeline(previous, action)

        if (merged.appended) {
          emit_chat_action_realtime_rendered({
            room_uuid: action.room_uuid,
            action,
            inserted_index: merged.rows.length - 1,
            source_channel: 'admin',
            phase: 'admin_reception_room_support_action',
          })
        }

        return merged.appended ? merged.rows : previous
      })
    },
    [room_uuid],
  )

  const handle_realtime_message = useCallback(
    (archived: realtime_archived_message) => {
      const mapped = archived_message_to_timeline_message({
        archive_uuid: archived.archive_uuid,
        room_uuid: archived.room_uuid,
        sequence: archived.sequence,
        created_at: archived.created_at,
        bundle: archived.bundle,
      })

      let update_result = {
        prev_count: 0,
        next_count: 0,
        dedupe_hit: false,
      }

      set_live_messages((previous) => {
        const merged = merge_timeline_message_rows(
          previous,
          [mapped],
          'realtime',
        )

        update_result = {
          prev_count: previous.length,
          next_count: merged.rows.length,
          dedupe_hit: merged.duplicates_skipped.length > 0,
        }

        return merged.rows
      })

      if (!update_result.dedupe_hit) {
        handle_chat_message_toast({
          room_uuid: archived.room_uuid,
          active_room_uuid: room_uuid,
          message_uuid: archived.archive_uuid,
          sender_user_uuid: archived.sender_user_uuid ?? null,
          sender_participant_uuid: archived.sender_participant_uuid ?? null,
          sender_role: archived.sender_role ?? archived.bundle.sender ?? null,
          active_user_uuid: props.staff_user_uuid,
          active_participant_uuid: props.staff_participant_uuid,
          active_role: 'admin',
          role: 'admin',
          tier: props.staff_tier,
          source_channel: 'admin',
          target_path: `/admin/reception/${archived.room_uuid}`,
          phase: 'admin_reception_room_realtime_message',
          is_scrolled_to_bottom: true,
          subtitle: resolve_realtime_message_subtitle_for_toast(
            archived,
            room_display_title_ref.current,
          ),
          scroll_to_bottom: () => {},
        })
      }

      return update_result
    },
    [
      room_uuid,
      props.staff_participant_uuid,
      props.staff_tier,
      props.staff_user_uuid,
    ],
  )

  const handle_realtime_action = useCallback(
    (action: chat_action_realtime_payload, inserted_index: number) => {
      let update_result = {
        prev_count: 0,
        next_count: 0,
        dedupe_hit: false,
        appended: false,
      }

      set_live_messages((previous) => {
        const merged = append_chat_action_to_admin_timeline(previous, action)

        update_result = {
          prev_count: previous.length,
          next_count: merged.rows.length,
          dedupe_hit: !merged.appended,
          appended: merged.appended,
        }

        return merged.appended ? merged.rows : previous
      })

      if (update_result.appended) {
        emit_chat_action_realtime_rendered({
          room_uuid: action.room_uuid,
          action,
          inserted_index,
          source_channel: 'admin',
          phase: 'admin_reception_room_realtime_action',
        })
      }

      return update_result
    },
    [],
  )

  const append_live_timeline_messages = useCallback(
    (addition: chat_room_timeline_message[]) => {
      set_live_messages((previous) =>
        merge_timeline_message_rows(previous, addition, 'realtime').rows,
      )
    },
    [],
  )

  return (
    <div className="-mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <AdminReceptionLive
        room_uuid={room_uuid}
        admin_user_uuid={props.admin_user_uuid}
        admin_participant_uuid={props.admin_participant_uuid}
        staff_user_uuid={props.staff_user_uuid}
        staff_tier={props.staff_tier}
        staff_participant_uuid={props.staff_participant_uuid}
        enabled={Boolean(room_uuid)}
        export_messages_channel_ref={realtime_messages_channel_ref}
        on_message={handle_realtime_message}
        on_action={handle_realtime_action}
        on_support_action={handle_support_action}
      />

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
          realtime_messages_channel_ref={realtime_messages_channel_ref}
          on_append_timeline_messages={append_live_timeline_messages}
        />
      </section>
    </div>
  )
}
