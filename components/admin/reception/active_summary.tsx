'use client'

import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import {
  format_admin_room_unread_label,
  normalize_reception_channel,
  reception_channel_label,
  reception_mode_badge_label,
  type reception_room,
} from '@/lib/admin/reception/display'
import {
  merge_admin_support_staff_from_presence,
  reception_room_refresh_admin_support_strings,
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
  customer_display_name: string
  staff_user_uuid: string | null
  staff_tier: string | null
  staff_participant_uuid: string
}

export default function AdminReceptionActiveSummary({
  room,
  room_uuid,
  customer_display_name,
  staff_tier,
  staff_user_uuid,
  staff_participant_uuid,
}: AdminReceptionActiveSummaryProps) {
  const [summary, set_summary] = useState({
    mode: room?.mode ?? null,
    last_incoming_channel: room?.last_incoming_channel ?? null,
    unread_count: room?.unread_count ?? 0,
    user_is_typing: room?.user_is_typing ?? false,
    user_typing_at: room?.user_typing_at ?? null,
    admin_support_staff: room?.admin_support_staff ?? [],
  })

  useEffect(() => {
    set_summary({
      mode: room?.mode ?? null,
      last_incoming_channel: room?.last_incoming_channel ?? null,
      unread_count: room?.unread_count ?? 0,
      user_is_typing: room?.user_is_typing ?? false,
      user_typing_at: room?.user_typing_at ?? null,
      admin_support_staff: room?.admin_support_staff ?? [],
    })
  }, [room])

  useEffect(() => {
    if (!room_uuid) {
      return
    }

    const tick = window.setInterval(() => {
      set_summary((previous) => {
        const now = new Date()
        let touched = false
        let next = previous

        if (previous.admin_support_staff.length > 0) {
          const refreshed = reception_room_refresh_admin_support_strings({
            staff: previous.admin_support_staff,
            now,
          })

          if (
            refreshed.admin_support_staff !== previous.admin_support_staff
          ) {
            next = {
              ...previous,
              admin_support_staff: refreshed.admin_support_staff,
            }
            touched = true
          }
        }

        if (!next.user_is_typing && !next.user_typing_at) {
          return touched ? next : previous
        }

        const fresh = typing_timestamp_is_fresh(
          next.user_typing_at ?? null,
          next.user_is_typing ?? null,
          now,
        )

        if (fresh === (next.user_is_typing ?? false)) {
          return touched ? next : previous
        }

        return {
          ...next,
          user_is_typing: fresh,
        }
      })
    }, 1_000)

    return () => {
      window.clearInterval(tick)
    }
  }, [room_uuid])

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
      listener_scope: 'admin_active',
      on_message: () => {},
      on_typing: () => {},
      on_presence: (presence) => {
        const role = presence.role?.trim().toLowerCase() ?? ''

        if (role === 'user' || role === 'driver') {
          const is_typing = typing_timestamp_is_fresh(
            presence.typing_at,
            presence.is_typing,
            new Date(),
          )

          set_summary((previous) => ({
            ...previous,
            user_is_typing: is_typing,
            user_typing_at: presence.typing_at,
            last_incoming_channel:
              normalize_reception_channel(presence.source_channel) ??
              previous.last_incoming_channel,
          }))

          send_chat_realtime_debug({
            event: 'admin_presence_state_updated',
            room_uuid: presence.room_uuid,
            participant_uuid: presence.participant_uuid,
            role: presence.role,
            source_channel: presence.source_channel ?? 'web',
            is_active: presence.is_active,
            is_typing,
            last_seen_at: presence.last_seen_at,
            typing_at: presence.typing_at,
            ignored_reason: null,
            phase: 'admin_active_room_summary_presence',
          })

          return
        }

        if (role !== 'admin' && role !== 'concierge') {
          return
        }

        set_summary((previous) => {
          const staff = merge_admin_support_staff_from_presence({
            staff: previous.admin_support_staff,
            presence,
          })

          send_chat_realtime_debug({
            event: 'admin_support_status_updated',
            room_uuid: presence.room_uuid,
            active_room_uuid: room_uuid,
            participant_uuid: presence.participant_uuid,
            user_uuid: presence.user_uuid,
            role: presence.role,
            source_channel: presence.source_channel ?? 'admin',
            is_active: presence.is_active,
            is_typing: presence.is_typing,
            last_seen_at: presence.last_seen_at,
            typing_at: presence.typing_at,
            ignored_reason: null,
            phase: 'admin_active_room_summary_support_presence',
          })

          return {
            ...previous,
            admin_support_staff: staff,
          }
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

          send_chat_realtime_debug({
            event: 'room_unread_realtime_received',
            room_uuid,
            phase: 'admin_active_summary_rooms_realtime',
            unread_admin_count: unread_next,
            admin_last_read_at:
              typeof new_row.admin_last_read_at === 'string'
                ? new_row.admin_last_read_at
                : null,
            actor_admin_user_uuid: staff_user_uuid,
          })

          set_summary((previous) => ({
            ...previous,
            unread_count:
              unread_next !== null ? unread_next : previous.unread_count,
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

  const mode_badge = reception_mode_badge_label(summary.mode)

  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-[16px] font-semibold leading-tight text-black">
        {customer_display_name}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-medium text-neutral-500">
          {room_uuid.slice(0, 8)}
        </span>
        {mode_badge ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              mode_badge === 'concierge'
                ? 'bg-amber-100 text-amber-900'
                : 'bg-sky-100 text-sky-900'
            }`}
          >
            {mode_badge}
          </span>
        ) : null}
        <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
          {reception_channel_label(summary.last_incoming_channel)}
        </span>
        {summary.unread_count > 0 ? (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            {format_admin_room_unread_label(summary.unread_count)}
          </span>
        ) : null}
        {summary.user_is_typing ? (
          <span className="text-[11px] font-medium text-neutral-500">
            ユーザー入力中
          </span>
        ) : null}
      </div>
    </div>
  )
}
