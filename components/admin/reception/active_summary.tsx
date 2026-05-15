'use client'

import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import {
  format_admin_room_unread_label,
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
} from '@/lib/chat/realtime/client'
import { archived_message_to_timeline_message } from '@/lib/chat/timeline_display'
import { create_browser_supabase } from '@/lib/db/browser'

type AdminReceptionActiveSummaryProps = {
  room_uuid: string
  room: reception_room | null
  subject: {
    display_name: string
    role: string | null
    tier: string | null
  }
  staff_user_uuid: string | null
  staff_tier: string | null
}

export default function AdminReceptionActiveSummary({
  room,
  room_uuid,
  staff_tier,
  staff_user_uuid,
  subject,
}: AdminReceptionActiveSummaryProps) {
  const [summary, set_summary] = useState({
    preview: room?.preview ?? '',
    updated_at: room?.updated_at ?? null,
    mode: room?.mode ?? null,
    last_incoming_channel: room?.last_incoming_channel ?? null,
    unread_count: room?.unread_count ?? 0,
    user_participant_uuid: room?.user_participant_uuid ?? null,
    user_is_typing: room?.user_is_typing ?? false,
    user_is_online: room?.user_is_online ?? false,
    user_last_seen_at: room?.user_last_seen_at ?? null,
    presence_source_channel: room?.presence_source_channel ?? null,
  })

  useEffect(() => {
    set_summary({
      preview: room?.preview ?? '',
      updated_at: room?.updated_at ?? null,
      mode: room?.mode ?? null,
      last_incoming_channel: room?.last_incoming_channel ?? null,
      unread_count: room?.unread_count ?? 0,
      user_participant_uuid: room?.user_participant_uuid ?? null,
      user_is_typing: room?.user_is_typing ?? false,
      user_is_online: room?.user_is_online ?? false,
      user_last_seen_at: room?.user_last_seen_at ?? null,
      presence_source_channel: room?.presence_source_channel ?? null,
    })
  }, [room])

  useEffect(() => {
    if (!room_uuid) {
      return
    }

    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    let channel: RealtimeChannel | null = null

    channel = subscribe_chat_room_realtime({
      supabase,
      room_uuid,
      active_room_uuid: room_uuid,
      participant_uuid: null,
      user_uuid: staff_user_uuid,
      role: 'admin',
      tier: staff_tier,
      source_channel: 'admin',
      on_message: (message) => {
        const source_channel =
          message.body_source_channel ?? message.insert_row_channel ?? null
        const row = archived_message_to_timeline_message({
          archive_uuid: message.archive_uuid,
          room_uuid: message.room_uuid,
          sequence: message.sequence,
          created_at: message.created_at,
          bundle: message.bundle,
        })
        const latest_text = row.text?.trim() || null
        const next_preview = resolve_chat_room_list_preview_text({
          audience: 'admin_inbox',
          latest_message_text: latest_text,
          typing_user_active: false,
          typing_staff_lines: [],
          typing_placeholder_ja: '入力中...',
          fallback_when_empty: 'メッセージ',
        })
        const channel_value = message.insert_row_channel ?? source_channel
        const direction = message.body_direction ?? null
        const last_message_at = message.created_at ?? new Date().toISOString()

        send_chat_realtime_debug({
          event: 'admin_room_list_state_update_started',
          room_uuid: message.room_uuid,
          message_uuid: message.archive_uuid,
          payload_message_uuid: message.archive_uuid,
          source_channel: source_channel ?? 'web',
          channel: channel_value,
          direction,
          last_message_at,
          prev_room_count: 1,
          next_room_count: null,
          ignored_reason: null,
          phase: 'admin_active_room_summary',
        })

        set_summary((previous) => {
          const next = {
            ...previous,
            preview: next_preview,
            updated_at: last_message_at,
            last_incoming_channel:
              direction === 'incoming'
                ? source_channel ?? channel_value
                : previous.last_incoming_channel,
          }

          send_chat_realtime_debug({
            event: 'admin_room_list_state_update_succeeded',
            room_uuid: message.room_uuid,
            message_uuid: message.archive_uuid,
            payload_message_uuid: message.archive_uuid,
            source_channel: source_channel ?? 'web',
            channel: channel_value,
            direction,
            last_message_at,
            prev_room_count: 1,
            next_room_count: 1,
            ignored_reason: null,
            phase: 'admin_active_room_summary',
          })

          return next
        })
      },
      on_typing: () => {},
      on_presence: (presence) => {
        if (presence.role !== 'user') {
          return
        }

        set_summary((previous) => ({
          ...previous,
          user_participant_uuid: presence.participant_uuid,
          user_is_typing: typing_timestamp_is_fresh(
            presence.typing_at,
            presence.is_typing,
            new Date(),
          ),
          user_is_online: presence.is_active,
          user_last_seen_at: presence.last_seen_at,
          presence_source_channel: presence.source_channel,
          last_incoming_channel:
            presence.source_channel ?? previous.last_incoming_channel,
        }))

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
          ignored_reason: null,
          phase: 'admin_active_room_summary_presence',
        })
      },
    })

    const rooms_row_channel = supabase
      .channel(`admin_active_summary_room_row:${room_uuid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `room_uuid=eq.${room_uuid}`,
        },
        (payload) => {
          const new_row = payload.new as Record<string, unknown>
          const uc = new_row.unread_admin_count
          const unread_next =
            typeof uc === 'number' ? Math.max(0, Math.floor(uc)) : null
          const admin_read =
            typeof new_row.admin_last_read_at === 'string'
              ? new_row.admin_last_read_at
              : null
          const updated_row =
            typeof new_row.updated_at === 'string' ? new_row.updated_at : null
          const preview_row =
            typeof new_row.last_message_body === 'string' &&
            new_row.last_message_body.trim()
              ? new_row.last_message_body.trim()
              : null

          send_chat_realtime_debug({
            event: 'room_unread_realtime_received',
            room_uuid,
            phase: 'admin_active_summary_rooms_realtime',
            unread_admin_count: unread_next,
            admin_last_read_at: admin_read,
            actor_admin_user_uuid: staff_user_uuid,
          })

          set_summary((previous) => ({
            ...previous,
            unread_count:
              unread_next !== null ? unread_next : previous.unread_count,
            updated_at: updated_row ?? previous.updated_at,
            preview: preview_row ?? previous.preview,
          }))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(rooms_row_channel)
      if (!channel) {
        return
      }

      cleanup_chat_room_realtime({
        supabase,
        channel,
        room_uuid,
        active_room_uuid: room_uuid,
        participant_uuid: null,
        user_uuid: staff_user_uuid,
        role: 'admin',
        tier: staff_tier,
        source_channel: 'admin',
        cleanup_reason: 'admin_active_summary_unmount',
      })
    }
  }, [room_uuid, staff_tier, staff_user_uuid])

  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-[16px] font-semibold leading-tight text-black">
        {subject.display_name}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-neutral-500">
        <span>
          {subject.role ?? 'user'} / {subject.tier ?? 'guest'}
        </span>
        {summary.mode ? (
          <>
            <span aria-hidden>{'/'}</span>
            <span>{summary.mode}</span>
          </>
        ) : null}
        <span aria-hidden>{'/'}</span>
        <span className="font-mono">{room_uuid.slice(0, 8)}</span>
        <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-white">
          {reception_channel_label(summary.last_incoming_channel)}
        </span>
        <span>
          {reception_presence_label({
            is_typing: summary.user_is_typing,
            is_online: summary.user_is_online,
            last_seen_at: summary.user_last_seen_at,
          })}
        </span>
        {summary.unread_count > 0 ? (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-white">
            {format_admin_room_unread_label(summary.unread_count)}
          </span>
        ) : null}
      </div>
      {summary.preview ? (
        <p className="mt-1 truncate text-[12px] leading-tight text-neutral-500">
          {summary.preview}
        </p>
      ) : null}
    </div>
  )
}
