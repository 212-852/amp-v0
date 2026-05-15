'use client'

import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import {
  reception_channel_label,
  type reception_room,
} from '@/lib/admin/reception/display'
import { resolve_chat_room_list_preview_text } from '@/lib/chat/presence/rules'
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
  })

  useEffect(() => {
    set_summary({
      preview: room?.preview ?? '',
      updated_at: room?.updated_at ?? null,
      mode: room?.mode ?? null,
      last_incoming_channel: room?.last_incoming_channel ?? null,
      unread_count: room?.unread_count ?? 0,
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
            unread_count:
              direction === 'incoming'
                ? previous.unread_count + 1
                : previous.unread_count,
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
    })

    return () => {
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
        {summary.unread_count > 0 ? (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-white">
            {summary.unread_count}
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
