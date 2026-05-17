'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import AdminReceptionRoomListLive from '@/components/admin/reception/room_list_live'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import {
  normalize_reception_state,
  type reception_state,
} from '@/lib/admin/reception/rules'
import type { reception_room } from '@/lib/admin/reception/types'
import { create_browser_supabase } from '@/lib/db/browser'

type AdminReceptionProps = {
  admin_user_uuid: string
  rooms: reception_room[]
  state: reception_state
}

export default function AdminReception({
  admin_user_uuid,
  rooms,
  state,
}: AdminReceptionProps) {
  const [reception_state, set_reception_state] =
    useState<reception_state>(state)
  const [visible_rooms, set_visible_rooms] = useState<reception_room[]>(
    state === 'open' ? rooms : [],
  )

  useEffect(() => {
    set_reception_state(state)
    set_visible_rooms(state === 'open' ? rooms : [])
  }, [rooms, state])

  const refetch_rooms = useCallback(async () => {
    const response = await fetch('/api/admin/reception/rooms?mode=concierge', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error('chat_list_refetch_failed')
    }

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; state?: unknown; rooms?: reception_room[] }
      | null
    const next_state = normalize_reception_state(payload?.state)

    if (!payload?.ok || !next_state || !Array.isArray(payload.rooms)) {
      throw new Error('chat_list_refetch_invalid_payload')
    }

    set_reception_state(next_state)
    set_visible_rooms(next_state === 'open' ? payload.rooms.slice(0, 3) : [])
  }, [])

  useEffect(() => {
    const supabase = create_browser_supabase()

    if (!supabase) {
      send_admin_chat_debug({
        event: 'reception_state_realtime_failed',
        level: 'error',
        admin_user_uuid,
        error_code: 'supabase_client_unavailable',
        error_message: 'Supabase browser client is unavailable.',
        phase: 'admin_top_reception',
      })
      return
    }

    let cancelled = false

    void (async () => {
      const result = await supabase
        .from('receptions')
        .select('state')
        .eq('user_uuid', admin_user_uuid)
        .maybeSingle()

      if (cancelled) {
        return
      }

      if (result.error) {
        set_reception_state('closed')
        set_visible_rooms([])
        send_admin_chat_debug({
          event: 'reception_state_load_failed',
          level: 'error',
          admin_user_uuid,
          error_code:
            typeof result.error.code === 'string'
              ? result.error.code
              : 'reception_state_load_failed',
          error_message: result.error.message,
          phase: 'admin_top_reception',
        })
        return
      }

      const next_state =
        normalize_reception_state(
          (result.data as { state?: unknown } | null)?.state,
        ) ?? 'closed'

      set_reception_state(next_state)
      set_visible_rooms(next_state === 'open' ? rooms : [])
    })()

    const apply_row = (row: { state?: unknown } | null) => {
      const next_state = normalize_reception_state(row?.state)

      if (!next_state) {
        return
      }

      set_reception_state(next_state)

      if (next_state !== 'open') {
        set_visible_rooms([])
        return
      }

      void refetch_rooms().catch((error) => {
        send_admin_chat_debug({
          event: 'chat_list_refetch_failed',
          level: 'error',
          admin_user_uuid,
          error_code: 'chat_list_refetch_failed',
          error_message:
            error instanceof Error ? error.message : String(error),
          phase: 'admin_top_reception',
        })
      })
    }

    const channel = supabase
      .channel(`receptions:top:${admin_user_uuid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'receptions',
          filter: `user_uuid=eq.${admin_user_uuid}`,
        },
        (payload) => {
          apply_row(payload.new as { state?: unknown } | null)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'receptions',
          filter: `user_uuid=eq.${admin_user_uuid}`,
        },
        (payload) => {
          apply_row(payload.new as { state?: unknown } | null)
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          send_admin_chat_debug({
            event: 'reception_state_realtime_failed',
            level: 'error',
            admin_user_uuid,
            error_code: 'reception_state_realtime_failed',
            error_message: status,
            subscribe_status: status,
            phase: 'admin_top_reception',
          })
        }
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [admin_user_uuid, refetch_rooms, rooms])

  if (reception_state !== 'open') {
    return null
  }

  if (visible_rooms.length === 0) {
    return (
      <section
        aria-label="Admin reception inbox"
        className="flex items-center justify-between rounded-2xl border border-dashed border-neutral-200 bg-white px-3 py-2 text-[12px] text-neutral-500"
      >
        <span>対応中の案件はありません</span>
        <Link
          href="/admin/reception"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-black"
        >
          一覧へ
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </section>
    )
  }

  return (
    <section
      aria-label="Admin reception inbox"
      className="flex flex-col gap-2"
    >
      <AdminReceptionRoomListLive
        initial_rooms={visible_rooms}
        limit={3}
        reception_state={reception_state}
      />
      <div className="flex justify-end pr-1">
        <Link
          href="/admin/reception"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-black"
        >
          一覧へ
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </section>
  )
}
