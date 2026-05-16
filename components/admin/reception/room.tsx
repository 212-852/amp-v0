'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import AdminChat from '@/components/admin/chat'
import AdminHandoffMemo from '@/components/admin/memo'
import AdminReceptionActiveSummary from '@/components/admin/reception/active_summary'
import AdminReceptionLive from '@/components/admin/reception/live'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import type { handoff_memo } from '@/lib/chat/action'
import type {
  reception_room,
  reception_room_message,
} from '@/lib/admin/reception/types'
import {
  append_chat_action_to_admin_timeline,
  type chat_action_realtime_payload,
} from '@/lib/chat/realtime/chat_actions'
import type {
  chat_presence_payload,
  chat_typing_payload,
} from '@/lib/chat/realtime/client'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import {
  clear_peer_typing_participant,
  handle_presence_typing_for_ui,
  handle_typing_broadcast_for_ui,
  peer_typing_label_for_admin,
  schedule_peer_typing_sweep,
  type peer_typing_row,
} from '@/lib/chat/realtime/typing_ui'
import {
  archived_message_to_timeline_message,
  merge_timeline_message_rows,
  type chat_room_timeline_message,
} from '@/lib/chat/timeline_display'
import { handle_chat_message_toast } from '@/lib/output/toast'
import { resolve_realtime_message_subtitle_for_toast } from '@/lib/chat/realtime/toast_decision'
import type { RealtimeChannel } from '@supabase/supabase-js'

type AdminReceptionRoomProps = {
  room_uuid: string
  room: reception_room | null
  customer_display_name: string
  staff_user_uuid: string | null
  staff_tier: string | null
  staff_participant_uuid: string
  staff_display_name: string
  memos: handoff_memo[]
  messages: reception_room_message[]
  load_failed: boolean
  admin_user_uuid: string
  admin_participant_uuid: string
}

export default function AdminReceptionRoom(props: AdminReceptionRoomProps) {
  const [live_messages, set_live_messages] = useState<chat_room_timeline_message[]>(
    () => props.messages,
  )
  const realtime_messages_channel_ref = useRef<RealtimeChannel | null>(null)
  const peer_typing_map_ref = useRef<Map<string, peer_typing_row>>(new Map())
  const active_typing_identity_ref = useRef({
    user_uuid: null as string | null,
    participant_uuid: null as string | null,
    role: null as string | null,
  })
  const [peer_typing_label, set_peer_typing_label] = useState<string | null>(
    null,
  )
  const room_display_title_ref = useRef(props.customer_display_name)
  const room_rendered_debug_ref = useRef<string | null>(null)
  const live_room_uuid = props.room?.room_uuid ?? props.room_uuid

  useLayoutEffect(() => {
    const focus_room = props.room_uuid.trim()

    if (!focus_room || room_rendered_debug_ref.current === focus_room) {
      return
    }

    room_rendered_debug_ref.current = focus_room

    send_admin_chat_debug({
      event: 'admin_reception_room_rendered',
      room_uuid: focus_room,
      active_room_uuid: focus_room,
      admin_user_uuid: props.admin_user_uuid.trim() || null,
      admin_participant_uuid: props.admin_participant_uuid.trim() || null,
      component_file: 'components/admin/reception/room.tsx',
      pathname: `/admin/reception/${focus_room}`,
      phase: 'admin_reception_room',
    })
  }, [props.admin_participant_uuid, props.admin_user_uuid, props.room_uuid])

  useEffect(() => {
    room_display_title_ref.current = props.customer_display_name
    active_typing_identity_ref.current = {
      user_uuid: props.staff_user_uuid,
      participant_uuid: props.staff_participant_uuid,
      role: 'admin',
    }
  }, [
    props.customer_display_name,
    props.staff_participant_uuid,
    props.staff_user_uuid,
  ])

  const refresh_peer_typing_label = useCallback(() => {
    set_peer_typing_label(
      peer_typing_label_for_admin(
        peer_typing_map_ref.current,
        props.staff_participant_uuid,
      ),
    )
  }, [props.staff_participant_uuid])

  const handle_remote_typing = useCallback(
    (typing: chat_typing_payload) => {
      handle_typing_broadcast_for_ui({
        owner: 'admin',
        room_uuid: props.room_uuid,
        map: peer_typing_map_ref.current,
        typing,
        self_participant_uuid: props.staff_participant_uuid,
        on_label_change: set_peer_typing_label,
        resolve_label: peer_typing_label_for_admin,
      })
      schedule_peer_typing_sweep({
        owner: 'admin',
        room_uuid: props.room_uuid,
        map: peer_typing_map_ref.current,
        self_participant_uuid: props.staff_participant_uuid,
        on_label_change: set_peer_typing_label,
        resolve_label: peer_typing_label_for_admin,
      })
    },
    [props.room_uuid, props.staff_participant_uuid],
  )

  const handle_remote_presence = useCallback(
    (presence: chat_presence_payload) => {
      handle_presence_typing_for_ui({
        owner: 'admin',
        room_uuid: props.room_uuid,
        map: peer_typing_map_ref.current,
        presence,
        self_participant_uuid: props.staff_participant_uuid,
        on_label_change: set_peer_typing_label,
        resolve_label: peer_typing_label_for_admin,
      })
      schedule_peer_typing_sweep({
        owner: 'admin',
        room_uuid: props.room_uuid,
        map: peer_typing_map_ref.current,
        self_participant_uuid: props.staff_participant_uuid,
        on_label_change: set_peer_typing_label,
        resolve_label: peer_typing_label_for_admin,
      })
    },
    [props.room_uuid, props.staff_participant_uuid],
  )

  useEffect(() => {
    set_live_messages(
      merge_timeline_message_rows([], props.messages, 'initial_fetch').rows,
    )
  }, [props.messages, props.room_uuid])

  const handle_support_action = useCallback(
    (action: chat_action_realtime_payload) => {
      if (action.room_uuid.trim() !== props.room_uuid.trim()) {
        return
      }

      set_live_messages((previous) => {
        const merged = append_chat_action_to_admin_timeline(previous, action)

        return merged.appended ? merged.rows : previous
      })
    },
    [props.room_uuid],
  )

  const handle_realtime_message = useCallback(
    (archived: realtime_archived_message) => {
      const active_room_focus = props.room_uuid.trim()
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

      if (archived.sender_participant_uuid) {
        clear_peer_typing_participant(
          peer_typing_map_ref.current,
          archived.sender_participant_uuid,
        )
        refresh_peer_typing_label()
      }

      if (!update_result.dedupe_hit) {
        handle_chat_message_toast({
          room_uuid: archived.room_uuid,
          active_room_uuid: active_room_focus,
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
      props.room_uuid,
      props.staff_participant_uuid,
      props.staff_tier,
      props.staff_user_uuid,
      refresh_peer_typing_label,
    ],
  )

  const handle_realtime_action = useCallback(
    (action: chat_action_realtime_payload, _inserted_index: number) => {
      let update_result = {
        prev_count: 0,
        next_count: 0,
        dedupe_hit: false,
      }

      set_live_messages((previous) => {
        const merged = append_chat_action_to_admin_timeline(previous, action)

        update_result = {
          prev_count: previous.length,
          next_count: merged.rows.length,
          dedupe_hit: !merged.appended,
        }

        return merged.appended ? merged.rows : previous
      })

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

      <AdminReceptionLive
        key={`live:${live_room_uuid}:${props.admin_participant_uuid}`}
        room_uuid={live_room_uuid}
        admin_user_uuid={props.admin_user_uuid}
        admin_participant_uuid={props.admin_participant_uuid}
        staff_user_uuid={props.staff_user_uuid}
        staff_tier={props.staff_tier}
        staff_participant_uuid={props.staff_participant_uuid}
        on_message={handle_realtime_message}
        on_action={handle_realtime_action}
        on_support_action={handle_support_action}
        on_typing={handle_remote_typing}
        on_presence={handle_remote_presence}
        active_typing_identity_ref={active_typing_identity_ref}
        realtime_messages_channel_ref={realtime_messages_channel_ref}
      />

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
        messages={live_messages}
        load_failed={props.load_failed}
        room_uuid={props.room_uuid}
        staff_participant_uuid={props.staff_participant_uuid}
        staff_display_name={props.staff_display_name}
        staff_user_uuid={props.staff_user_uuid}
        staff_tier={props.staff_tier}
        room_display_title={props.customer_display_name}
        admin_user_uuid={props.admin_user_uuid}
        admin_participant_uuid={props.admin_participant_uuid}
        realtime_messages_channel_ref={realtime_messages_channel_ref}
        on_append_timeline_messages={append_live_timeline_messages}
        peer_typing_label={peer_typing_label}
      />
    </div>
  )
}
