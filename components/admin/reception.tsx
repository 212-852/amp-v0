'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import AdminReceptionRoomListLive from '@/components/admin/reception/room_list_live'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import {
  default_reception_state,
  normalize_reception_state,
  type reception_state,
} from '@/lib/admin/reception/rules'
import type { reception_room } from '@/lib/admin/reception/types'
import { create_browser_supabase } from '@/lib/db/browser'

const component_file = 'components/admin/reception.tsx'

type AdminReceptionProps = {
  admin_user_uuid: string
  rooms: reception_room[]
  state: reception_state
}

type reception_api_response = {
  ok?: boolean
  state?: unknown
}

type rooms_api_response = {
  ok?: boolean
  state?: unknown
  rooms?: reception_room[]
}

async function fetch_reception_state_from_api(): Promise<reception_state> {
  const response = await fetch('/api/admin/reception', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    return default_reception_state
  }

  const payload = (await response.json().catch(() => null)) as
    | reception_api_response
    | null

  return normalize_reception_state(payload?.state) ?? default_reception_state
}

export default function AdminReception({
  admin_user_uuid,
  rooms: server_rooms,
  state: server_state,
}: AdminReceptionProps) {
  const [reception_state, set_reception_state] =
    useState<reception_state>(server_state)
  const [visible_rooms, set_visible_rooms] = useState<reception_room[]>(
    server_state === 'open' ? server_rooms : [],
  )
  const last_debug_signature_ref = useRef<string | null>(null)

  const can_show_reception_rooms = reception_state === 'open'

  const load_rooms = useCallback(async () => {
    const response = await fetch('/api/admin/reception/rooms?mode=concierge', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error('admin_top_rooms_fetch_failed')
    }

    const payload = (await response.json().catch(() => null)) as
      | rooms_api_response
      | null
    const next_state = normalize_reception_state(payload?.state)

    if (!payload?.ok || !next_state) {
      throw new Error('admin_top_rooms_invalid_payload')
    }

    set_reception_state(next_state)

    if (next_state !== 'open') {
      set_visible_rooms([])
      return
    }

    set_visible_rooms(Array.isArray(payload.rooms) ? payload.rooms.slice(0, 3) : [])
  }, [])

  const apply_reception_state = useCallback(
    (next_state: reception_state, source: 'api' | 'realtime') => {
      set_reception_state(next_state)

      if (next_state !== 'open') {
        set_visible_rooms([])
        return
      }

      void load_rooms().catch((error) => {
        send_admin_chat_debug({
          event: 'chat_list_refetch_failed',
          level: 'error',
          admin_user_uuid,
          component_file,
          error_code: 'admin_top_rooms_fetch_failed',
          error_message: error instanceof Error ? error.message : String(error),
          phase: 'admin_top_reception',
          source_channel: source,
        })
      })
    },
    [admin_user_uuid, load_rooms],
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const next_state = await fetch_reception_state_from_api()

      if (cancelled) {
        return
      }

      apply_reception_state(next_state, 'api')
    })()

    return () => {
      cancelled = true
    }
  }, [apply_reception_state])

  useEffect(() => {
    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const handle_row = (row: { state?: unknown } | null) => {
      const next_state = normalize_reception_state(row?.state)

      if (!next_state) {
        return
      }

      apply_reception_state(next_state, 'realtime')
    }

    const channel = supabase
      .channel(`receptions:admin_top:${admin_user_uuid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'receptions',
          filter: `user_uuid=eq.${admin_user_uuid}`,
        },
        (payload) => {
          handle_row(payload.new as { state?: unknown } | null)
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
          handle_row(payload.new as { state?: unknown } | null)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [admin_user_uuid, apply_reception_state])

  useEffect(() => {
    const signature = `${reception_state}:${visible_rooms.length}`
    const should_send_debug = last_debug_signature_ref.current !== signature

    console.log('[actual_admin_top_renderer]', {
      component_file,
      reception_state,
      can_show_reception_rooms,
      room_count: visible_rooms.length,
    })

    if (should_send_debug) {
      last_debug_signature_ref.current = signature
      send_admin_chat_debug({
        event: 'actual_admin_top_renderer_checked',
        admin_user_uuid,
        component_file,
        reception_state,
        room_count: visible_rooms.length,
        should_render_rooms: can_show_reception_rooms,
        phase: 'admin_top_reception',
        source_channel: 'render',
      })
    }
  }, [
    admin_user_uuid,
    can_show_reception_rooms,
    reception_state,
    visible_rooms.length,
  ])

  return (
    <section
      aria-label="Admin reception inbox"
      className="flex flex-col gap-2"
      data-debug="actual_admin_top_renderer"
    >
      {can_show_reception_rooms ? (
        <>
          {visible_rooms.length === 0 ? (
            <div className="flex items-center justify-between rounded-2xl border border-dashed border-neutral-200 bg-white px-3 py-2 text-[12px] text-neutral-500">
              <span>対応中の案件はありません</span>
              <Link
                href="/admin/reception"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-black"
              >
                一覧へ
                <ArrowRight
                  className="h-3.5 w-3.5"
                  strokeWidth={2}
                  aria-hidden
                />
              </Link>
            </div>
          ) : (
            <>
              <AdminReceptionRoomListLive
                admin_user_uuid={admin_user_uuid}
                initial_rooms={visible_rooms}
                limit={3}
                mode="concierge"
                parent_controls_reception_gate
              />
              <div className="flex justify-end pr-1">
                <Link
                  href="/admin/reception"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-black"
                >
                  一覧へ
                  <ArrowRight
                    className="h-3.5 w-3.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Link>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-8 text-center text-sm font-medium text-neutral-500">
          Chat reception is OFF
        </div>
      )}
    </section>
  )
}
