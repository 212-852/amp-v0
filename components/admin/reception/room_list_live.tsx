'use client'

import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { use_session_profile } from '@/components/session/profile'
import {
  format_admin_room_unread_label,
  normalize_reception_channel,
  reception_channel_label,
  reception_presence_label,
  type reception_room,
} from '@/lib/admin/reception/display'
import {
  resolve_chat_room_list_preview_text,
  typing_timestamp_is_fresh,
} from '@/lib/chat/presence/rules'
import {
  cleanup_chat_room_realtime,
  send_chat_realtime_debug,
  subscribe_chat_room_realtime,
  type chat_presence_payload,
} from '@/lib/chat/realtime/client'
import { resolve_realtime_message_subtitle_for_toast } from '@/lib/chat/realtime/toast_decision'
import { archived_message_to_timeline_message } from '@/lib/chat/timeline_display'
import { create_browser_supabase } from '@/lib/db/browser'
import { handle_chat_message_toast } from '@/lib/output/toast'

type admin_reception_room_list_live_props = {
  initial_rooms: reception_room[]
  limit?: number
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

function presence_status_for_room(room: reception_room) {
  return reception_presence_label({
    is_typing: room.user_is_typing,
    is_online: room.user_is_online,
    last_seen_at: room.user_last_seen_at,
  })
}

function user_presence_patch(presence: chat_presence_payload) {
  const is_typing = typing_timestamp_is_fresh(
    presence.typing_at,
    presence.is_typing,
    new Date(),
  )

  return {
    user_participant_uuid: presence.participant_uuid,
    user_is_typing: is_typing,
    user_is_online: presence.is_active,
    user_last_seen_at: presence.last_seen_at,
    presence_source_channel: presence.source_channel,
  }
}

export default function AdminReceptionRoomListLive({
  initial_rooms,
  limit,
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
  const visible_rooms =
    typeof limit === 'number' ? rooms.slice(0, Math.max(0, limit)) : rooms

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
          const source_channel =
            message.body_source_channel ?? message.insert_row_channel ?? null
          const channel = message.insert_row_channel ?? source_channel
          const direction = message.body_direction ?? null
          const last_message_at = message.created_at ?? new Date().toISOString()

          send_chat_realtime_debug({
            event: 'admin_room_list_realtime_payload_received',
            room_uuid: message.room_uuid,
            message_uuid: message.archive_uuid,
            payload_message_uuid: message.archive_uuid,
            source_channel: source_channel ?? 'web',
            channel,
            direction,
            last_message_at,
            ignored_reason: null,
            phase: 'admin_room_list_realtime',
          })

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
          const next_channel =
            direction === 'incoming'
              ? source_channel ?? channel
              : null

          send_chat_realtime_debug({
            event: 'admin_room_list_realtime_payload_accepted',
            room_uuid: message.room_uuid,
            message_uuid: message.archive_uuid,
            payload_message_uuid: message.archive_uuid,
            source_channel: source_channel ?? 'web',
            channel,
            direction,
            last_message_at,
            ignored_reason: null,
            phase: 'admin_room_list_realtime',
          })

          set_rooms((previous) => {
            send_chat_realtime_debug({
              event: 'admin_room_list_state_update_started',
              room_uuid: message.room_uuid,
              message_uuid: message.archive_uuid,
              payload_message_uuid: message.archive_uuid,
              source_channel: source_channel ?? 'web',
              channel,
              direction,
              last_message_at,
              prev_room_count: previous.length,
              next_room_count: null,
              ignored_reason: null,
              phase: 'admin_room_list_state_update',
            })

            let matched = false
            const mapped = previous.map((row) => {
              if (row.room_uuid !== message.room_uuid) {
                return row
              }

              matched = true

              return {
                ...row,
                preview: next_preview,
                updated_at: last_message_at,
                mode: row.mode,
                last_incoming_channel:
                  next_channel ?? row.last_incoming_channel,
              }
            })

            if (!matched) {
              send_chat_realtime_debug({
                event: 'admin_room_list_state_update_failed',
                room_uuid: message.room_uuid,
                message_uuid: message.archive_uuid,
                payload_message_uuid: message.archive_uuid,
                source_channel: source_channel ?? 'web',
                channel,
                direction,
                last_message_at,
                prev_room_count: previous.length,
                next_room_count: previous.length,
                ignored_reason: 'room_not_in_current_list',
                phase: 'admin_room_list_state_update',
              })
              return previous
            }

            const sorted = [...mapped].sort(
              (a, b) =>
                new Date(b.updated_at ?? 0).getTime() -
                new Date(a.updated_at ?? 0).getTime(),
            )

            send_chat_realtime_debug({
              event: 'admin_room_card_resorted',
              room_uuid: message.room_uuid,
              message_uuid: message.archive_uuid,
              payload_message_uuid: message.archive_uuid,
              source_channel: source_channel ?? 'web',
              channel,
              direction,
              last_message_at,
              prev_room_count: previous.length,
              next_room_count: sorted.length,
              ignored_reason: null,
              phase: 'admin_room_list_state_update',
            })

            send_chat_realtime_debug({
              event: 'admin_room_list_state_update_succeeded',
              room_uuid: message.room_uuid,
              message_uuid: message.archive_uuid,
              payload_message_uuid: message.archive_uuid,
              source_channel: source_channel ?? 'web',
              channel,
              direction,
              last_message_at,
              prev_room_count: previous.length,
              next_room_count: sorted.length,
              ignored_reason: null,
              phase: 'admin_room_list_state_update',
            })

            return sorted
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
        on_presence: (presence) => {
          if (presence.role !== 'user') {
            return
          }

          set_rooms((previous) => {
            let matched = false
            const next = previous.map((row) => {
              if (row.room_uuid !== presence.room_uuid) {
                return row
              }

              matched = true
              return {
                ...row,
                ...user_presence_patch(presence),
                last_incoming_channel:
                  presence.source_channel ?? row.last_incoming_channel,
              }
            })

            send_chat_realtime_debug({
              event: 'admin_presence_state_updated',
              room_uuid: presence.room_uuid,
              participant_uuid: presence.participant_uuid,
              role: presence.role,
              source_channel: presence.source_channel ?? 'web',
              is_active: presence.is_active,
              is_typing: presence.is_typing,
              last_seen_at: presence.last_seen_at,
              typing_at: presence.typing_at,
              ignored_reason: matched ? null : 'room_not_in_current_list',
              phase: 'admin_room_list_presence',
            })

            return matched ? next : previous
          })
        },
      })

      channels.push(channel)
    })

    const rooms_filter =
      room_uuids.length === 1
        ? `room_uuid=eq.${room_uuids[0]}`
        : `room_uuid=in.(${room_uuids.join(',')})`

    const rooms_unread_channel = supabase
      .channel(`admin_reception_rooms_unread:${room_key}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: rooms_filter,
        },
        (payload) => {
          const new_row = payload.new as Record<string, unknown>
          const ru =
            typeof new_row.room_uuid === 'string' ? new_row.room_uuid : null

          if (!ru) {
            return
          }

          const unread_admin_count =
            typeof new_row.unread_admin_count === 'number'
              ? Math.max(0, Math.floor(new_row.unread_admin_count))
              : null
          const admin_last_read_at =
            typeof new_row.admin_last_read_at === 'string'
              ? new_row.admin_last_read_at
              : null
          const updated_at_row =
            typeof new_row.updated_at === 'string' ? new_row.updated_at : null
          const last_inc = normalize_reception_channel(
            new_row.last_incoming_channel,
          )
          const preview_body =
            typeof new_row.last_message_body === 'string' &&
            new_row.last_message_body.trim()
              ? new_row.last_message_body.trim()
              : null

          send_chat_realtime_debug({
            event: 'room_unread_realtime_received',
            room_uuid: ru,
            active_room_uuid: null,
            participant_uuid: null,
            user_uuid: session.user_uuid ?? null,
            role: 'admin',
            tier: session.tier ?? null,
            source_channel: 'admin',
            subscribe_status: null,
            channel_name: null,
            event_name: null,
            schema: 'public',
            postgres_event: 'UPDATE',
            table: 'rooms',
            filter: rooms_filter,
            message_uuid: null,
            payload_message_uuid: null,
            payload_action_uuid: null,
            payload_room_uuid: ru,
            sender_user_uuid: null,
            sender_participant_uuid: null,
            active_participant_uuid: null,
            active_user_uuid: session.user_uuid ?? null,
            active_role: 'admin',
            sender_role: null,
            display_name: null,
            is_typing: null,
            is_active: null,
            last_seen_at: null,
            typing_at: null,
            ignored_reason: null,
            error_code: null,
            error_message: null,
            error_details: null,
            error_hint: null,
            prev_message_count: null,
            next_message_count: null,
            prev_room_count: null,
            next_room_count: null,
            dedupe_hit: null,
            phase: 'admin_room_list_rooms_realtime',
            cleanup_reason: null,
            is_self_sender: null,
            comparison_strategy: null,
            guest_strategy_used: null,
            channel_topic: null,
            listener_registered: null,
            client_instance_id: null,
            payload_preview: null,
            visibility_state: null,
            is_scrolled_to_bottom: null,
            skip_reason: null,
            message_channel: null,
            message_source_channel: null,
            message_direction: null,
            channel: null,
            direction: null,
            last_message_at: updated_at_row,
            payload_channel: null,
            payload_source_channel: null,
            payload_direction: null,
            message_count_before: null,
            message_count_after: null,
            oldest_created_at: null,
            newest_created_at: null,
            realtime_message_uuid: null,
            realtime_created_at: null,
            unread_admin_count,
            admin_last_read_at,
            actor_admin_user_uuid: session.user_uuid ?? null,
          })

          set_rooms((previous) => {
            let matched = false
            const mapped = previous.map((row) => {
              if (row.room_uuid !== ru) {
                return row
              }

              matched = true

              return {
                ...row,
                unread_count:
                  unread_admin_count !== null
                    ? unread_admin_count
                    : (row.unread_count ?? 0),
                updated_at: updated_at_row ?? row.updated_at,
                last_incoming_channel:
                  last_inc !== null ? last_inc : row.last_incoming_channel,
                preview: preview_body ?? row.preview,
              }
            })

            send_chat_realtime_debug({
              event: 'admin_room_badge_updated',
              room_uuid: ru,
              active_room_uuid: null,
              participant_uuid: null,
              user_uuid: session.user_uuid ?? null,
              role: 'admin',
              tier: session.tier ?? null,
              source_channel: 'admin',
              subscribe_status: null,
              channel_name: null,
              event_name: null,
              schema: 'public',
              postgres_event: 'UPDATE',
              table: 'rooms',
              filter: rooms_filter,
              message_uuid: null,
              payload_message_uuid: null,
              payload_action_uuid: null,
              payload_room_uuid: ru,
              sender_user_uuid: null,
              sender_participant_uuid: null,
              active_participant_uuid: null,
              active_user_uuid: session.user_uuid ?? null,
              active_role: 'admin',
              sender_role: null,
              display_name: null,
              is_typing: null,
              is_active: null,
              last_seen_at: null,
              typing_at: null,
              ignored_reason: matched ? null : 'room_not_in_current_list',
              error_code: null,
              error_message: null,
              error_details: null,
              error_hint: null,
              prev_message_count: null,
              next_message_count: null,
              prev_room_count: previous.length,
              next_room_count: matched ? previous.length : null,
              dedupe_hit: null,
              phase: 'admin_room_list_rooms_realtime',
              cleanup_reason: null,
              is_self_sender: null,
              comparison_strategy: null,
              guest_strategy_used: null,
              channel_topic: null,
              listener_registered: null,
              client_instance_id: null,
              payload_preview: null,
              visibility_state: null,
              is_scrolled_to_bottom: null,
              skip_reason: null,
              message_channel: null,
              message_source_channel: null,
              message_direction: null,
              channel: null,
              direction: null,
              last_message_at: updated_at_row,
              payload_channel: null,
              payload_source_channel: null,
              payload_direction: null,
              message_count_before: null,
              message_count_after: null,
              oldest_created_at: null,
              newest_created_at: null,
              realtime_message_uuid: null,
              realtime_created_at: null,
              unread_admin_count,
              admin_last_read_at,
              actor_admin_user_uuid: session.user_uuid ?? null,
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
        },
      )
      .subscribe()

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
      void supabase.removeChannel(rooms_unread_channel)
    }
  }, [room_key, session?.role, session?.tier, session?.user_uuid])

  return (
    <ul className="flex flex-col gap-2">
      {visible_rooms.map((room) => (
        <li key={room.room_uuid}>
          <Link
            href={`/admin/reception/${room.room_uuid}`}
            className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <div className="relative shrink-0" aria-hidden>
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-700">
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
              {(room.unread_count ?? 0) > 0 ? (
                <span
                  className="absolute -left-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white"
                  aria-label={`未読 ${format_admin_room_unread_label(room.unread_count ?? 0)}`}
                >
                  {format_admin_room_unread_label(room.unread_count ?? 0)}
                </span>
              ) : null}
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
                <span className="text-neutral-500">
                  {presence_status_for_room(room)}
                </span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
