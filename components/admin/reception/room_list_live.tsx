'use client'

import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { use_session_profile } from '@/components/session/profile'
import {
  reception_channel_label,
  type reception_room,
} from '@/lib/admin/reception/display'
import { resolve_chat_room_list_preview_text } from '@/lib/chat/presence/rules'
import {
  cleanup_chat_room_realtime,
  subscribe_chat_room_realtime,
} from '@/lib/chat/realtime/client'
import { resolve_realtime_message_subtitle_for_toast } from '@/lib/chat/realtime/toast_decision'
import { archived_message_to_timeline_message } from '@/lib/chat/timeline_display'
import { create_browser_supabase } from '@/lib/db/browser'
import { handle_chat_message_toast } from '@/lib/output/toast'

type admin_reception_room_list_live_props = {
  initial_rooms: reception_room[]
}

function format_time(iso: string | null): string {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminReceptionRoomListLive({
  initial_rooms,
}: admin_reception_room_list_live_props) {
  const [rooms, set_rooms] = useState(initial_rooms)
  const { session } = use_session_profile()
  const titles_ref = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    set_rooms(initial_rooms)
  }, [initial_rooms])

  useEffect(() => {
    const next = new Map<string, string>()

    for (const row of initial_rooms) {
      next.set(
        row.room_uuid,
        row.title?.trim() ||
          row.display_name?.trim() ||
          row.room_uuid.slice(0, 8),
      )
    }

    titles_ref.current = next
  }, [initial_rooms])

  const room_key = useMemo(
    () =>
      initial_rooms
        .map((row) => row.room_uuid)
        .sort()
        .join(','),
    [initial_rooms],
  )

  useEffect(() => {
    if (session?.role !== 'admin' || room_key.length === 0) {
      return
    }

    const room_uuids = room_key.split(',').filter(Boolean)

    if (room_uuids.length === 0) {
      return
    }

    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const channels: RealtimeChannel[] = []

    room_uuids.forEach((room_uuid) => {
      const list_title =
        titles_ref.current.get(room_uuid) ?? room_uuid.slice(0, 8)

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
          const row_msg = archived_message_to_timeline_message({
            archive_uuid: message.archive_uuid,
            room_uuid: message.room_uuid,
            sequence: message.sequence,
            created_at: message.created_at,
            bundle: message.bundle,
          })
          const latest_text =
            row_msg.text && row_msg.text.trim().length > 0
              ? row_msg.text.trim()
              : null
          const next_preview = resolve_chat_room_list_preview_text({
            audience: 'admin_inbox',
            latest_message_text: latest_text,
            typing_user_active: false,
            typing_staff_lines: [],
            typing_placeholder_ja: '入力中...',
            fallback_when_empty: 'メッセージ',
          })
          const ts = message.created_at ?? new Date().toISOString()
          const message_channel =
            message.body_source_channel ?? message.insert_row_channel ?? null
          const next_channel =
            message.body_direction === 'incoming'
              ? message_channel
              : null

          set_rooms((previous) => {
            let matched = false
            const mapped = previous.map((row) => {
              if (row.room_uuid !== message.room_uuid) {
                return row
              }

              matched = true

              return {
                ...row,
                preview: next_preview,
                updated_at: ts,
                last_incoming_channel:
                  next_channel ?? row.last_incoming_channel,
              }
            })

            if (!matched) {
              return previous
            }

            return [...mapped].sort(
              (a, b) =>
                new Date(b.updated_at ?? 0).getTime() -
                new Date(a.updated_at ?? 0).getTime(),
            )
          })

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
      channels.forEach((ch, index) => {
        cleanup_chat_room_realtime({
          supabase,
          channel: ch,
          room_uuid: room_uuids[index] ?? '',
          active_room_uuid: null,
          participant_uuid: null,
          user_uuid: session.user_uuid ?? null,
          role: 'admin',
          tier: session.tier ?? null,
          source_channel: 'admin',
          cleanup_reason: 'admin_reception_room_list_unmount',
        })
      })
    }
  }, [room_key, session?.role, session?.tier, session?.user_uuid])

  return (
    <ul className="flex flex-col gap-2">
      {rooms.map((room) => (
        <li key={room.room_uuid}>
          <Link
            href={`/admin/reception/${room.room_uuid}`}
            className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-700"
              aria-hidden
            >
              {room.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={room.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : room.display_name ? (
                <span className="text-[12px] font-semibold">
                  {room.display_name.slice(0, 1)}
                </span>
              ) : (
                <MessageCircle className="h-4 w-4" strokeWidth={2} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-semibold leading-tight text-black">
                  {room.display_name}
                </span>
                <span className="shrink-0 text-[11px] font-medium leading-none text-neutral-400">
                  {format_time(room.updated_at)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[12px] leading-tight text-neutral-600">
                {room.preview}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium leading-none text-neutral-500">
                <span className="font-mono text-neutral-400">
                  {room.room_uuid.slice(0, 8)}
                </span>
                {room.mode ? (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700">
                    {room.mode}
                  </span>
                ) : null}
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-white">
                  {reception_channel_label(room.last_incoming_channel)}
                </span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
