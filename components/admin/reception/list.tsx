'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import AdminReceptionRoomListLive from '@/components/admin/reception/room_list_live'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import {
  normalize_reception_state,
  type reception_state,
} from '@/lib/admin/reception/rules'
import type {
  reception_room,
  reception_room_mode,
} from '@/lib/admin/reception/room'
import { create_browser_supabase } from '@/lib/db/browser'

type admin_reception_list_props = {
  admin_user_uuid: string
  initial_state: reception_state
  initial_rooms: reception_room[]
  mode: reception_room_mode
  load_ok: boolean
}

type reception_list_state = reception_state | 'loading'

const tabs: Array<{ mode: reception_room_mode; label: string }> = [
  { mode: 'concierge', label: 'コンシェルジュ' },
  { mode: 'bot', label: 'ボット' },
]

function debug_reception_visibility(input: {
  event: string
  admin_user_uuid: string
  reception_state: reception_list_state
  previous_state: reception_list_state | null
  next_state: reception_list_state | null
  room_count: number
  source: 'initial_load' | 'realtime' | 'toggle' | 'render'
}) {
  send_admin_chat_debug({
    event: input.event,
    admin_user_uuid: input.admin_user_uuid,
    reception_state: input.reception_state,
    previous_state: input.previous_state,
    next_state: input.next_state,
    room_count: input.room_count,
    should_render_rooms: input.reception_state === 'open',
    source_channel: input.source,
    phase: 'admin_reception_list_visibility',
  })
}

export default function AdminReceptionList({
  admin_user_uuid,
  initial_state,
  initial_rooms,
  mode,
  load_ok,
}: admin_reception_list_props) {
  const [reception_state, set_reception_state] =
    useState<reception_list_state>('loading')
  const [rooms, set_rooms] = useState<reception_room[]>([])
  const [rooms_load_ok, set_rooms_load_ok] = useState(load_ok)
  const should_render_rooms = reception_state === 'open'

  useEffect(() => {
    debug_reception_visibility({
      event: 'reception_render_gate_checked',
      admin_user_uuid,
      reception_state,
      previous_state: null,
      next_state: reception_state,
      room_count: rooms.length,
      source: 'render',
    })
  }, [admin_user_uuid, reception_state, rooms.length])

  useEffect(() => {
    set_reception_state('loading')
    set_rooms([])
    set_rooms_load_ok(load_ok)
  }, [admin_user_uuid, initial_state, initial_rooms, load_ok])

  const refetch_rooms = useCallback(async () => {
    const response = await fetch(`/api/admin/reception/rooms?mode=${mode}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error('chat_list_refetch_failed')
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean
          state?: unknown
          rooms?: reception_room[]
        }
      | null

    const next_state = normalize_reception_state(payload?.state)

    if (!payload?.ok || !next_state || !Array.isArray(payload.rooms)) {
      throw new Error('chat_list_refetch_invalid_payload')
    }

    set_reception_state(next_state)
    set_rooms(next_state === 'open' ? payload.rooms : [])
    set_rooms_load_ok(true)
    debug_reception_visibility({
      event: 'reception_rooms_refetched',
      admin_user_uuid,
      reception_state: next_state,
      previous_state: reception_state,
      next_state,
      room_count: next_state === 'open' ? payload.rooms.length : 0,
      source: 'realtime',
    })
  }, [mode])

  const apply_reception_state = useCallback(
    (next_state: reception_state, options?: { refetch?: boolean }) => {
      const previous_state = reception_state

      set_reception_state(next_state)

      debug_reception_visibility({
        event: 'reception_state_changed',
        admin_user_uuid,
        reception_state: next_state,
        previous_state,
        next_state,
        room_count: next_state === 'open' ? rooms.length : 0,
        source: options?.refetch ? 'realtime' : 'initial_load',
      })

      if (next_state !== 'open') {
        set_rooms([])
        set_rooms_load_ok(true)
        debug_reception_visibility({
          event: 'reception_rooms_cleared',
          admin_user_uuid,
          reception_state: next_state,
          previous_state,
          next_state,
          room_count: 0,
          source: options?.refetch ? 'realtime' : 'initial_load',
        })
        return
      }

      if (options?.refetch) {
        void refetch_rooms().catch((error) => {
          set_rooms_load_ok(false)
          send_admin_chat_debug({
            event: 'chat_list_refetch_failed',
            level: 'error',
            admin_user_uuid,
            error_code: 'chat_list_refetch_failed',
            error_message:
              error instanceof Error ? error.message : String(error),
            phase: 'admin_reception_list',
          })
        })
        return
      }

      set_rooms(initial_rooms)
      set_rooms_load_ok(load_ok)
    },
    [admin_user_uuid, initial_rooms, load_ok, reception_state, refetch_rooms, rooms.length],
  )

  useEffect(() => {
    const supabase = create_browser_supabase()

    if (!supabase) {
      send_admin_chat_debug({
        event: 'reception_state_realtime_failed',
        level: 'error',
        admin_user_uuid,
        error_code: 'supabase_client_unavailable',
        error_message: 'Supabase browser client is unavailable.',
        phase: 'admin_reception_list',
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
        set_rooms([])
        send_admin_chat_debug({
          event: 'reception_state_load_failed',
          level: 'error',
          admin_user_uuid,
          error_code:
            typeof result.error.code === 'string'
              ? result.error.code
              : 'reception_state_load_failed',
          error_message: result.error.message,
          phase: 'admin_reception_list',
        })
        return
      }

      const row = result.data as { state?: unknown } | null
      const next_state = normalize_reception_state(row?.state) ?? 'closed'
      debug_reception_visibility({
        event: 'reception_state_loaded',
        admin_user_uuid,
        reception_state: next_state,
        previous_state: reception_state,
        next_state,
        room_count: next_state === 'open' ? initial_rooms.length : 0,
        source: 'initial_load',
      })
      apply_reception_state(next_state)
    })()

    const handle_reception_payload = (row: { state?: unknown } | null) => {
      const next_state = normalize_reception_state(row?.state)

      if (!next_state) {
        return
      }

      debug_reception_visibility({
        event: 'reception_state_realtime_received',
        admin_user_uuid,
        reception_state: next_state,
        previous_state: reception_state,
        next_state,
        room_count: next_state === 'open' ? rooms.length : 0,
        source: 'realtime',
      })
      apply_reception_state(next_state, { refetch: next_state === 'open' })
    }

    const channel = supabase
      .channel(`receptions:list:${admin_user_uuid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'receptions',
          filter: `user_uuid=eq.${admin_user_uuid}`,
        },
        (payload) => {
          handle_reception_payload(payload.new as { state?: unknown } | null)
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
          handle_reception_payload(payload.new as { state?: unknown } | null)
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
            phase: 'admin_reception_list',
          })
        }
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [
    admin_user_uuid,
    apply_reception_state,
    initial_rooms.length,
    reception_state,
    rooms.length,
  ])

  return (
    <div className="flex flex-col gap-4">
      <header>
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-500"
        >
          <Link href="/admin" className="transition-colors hover:text-black">
            Home
          </Link>
          <span aria-hidden>{'>'}</span>
          <span className="text-neutral-900">チャット一覧</span>
        </nav>
      </header>

      <div className="grid grid-cols-2 gap-1 rounded-full bg-neutral-200/70 p-1">
        {tabs.map((tab) => {
          const is_selected = tab.mode === mode

          return (
            <Link
              key={tab.mode}
              href={`/admin/reception?mode=${tab.mode}`}
              className={`rounded-full px-3 py-2 text-center text-[12px] font-semibold transition-colors ${
                is_selected
                  ? 'bg-white text-black shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
                  : 'text-neutral-500 hover:text-black'
              }`}
              aria-current={is_selected ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      <section
        aria-label="Reception search"
        className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            inputMode="search"
            placeholder="名前・メッセージで検索"
            readOnly
            className="block w-full rounded-full border border-neutral-200 bg-white py-2 pl-9 pr-3 text-[13px] text-black placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
          />
        </div>
      </section>

      {reception_state === 'loading' ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          ...
        </div>
      ) : !should_render_rooms ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          Chat reception is OFF
        </div>
      ) : !rooms_load_ok ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          チャット一覧を読み込めませんでした
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          {mode === 'concierge'
            ? 'コンシェルジュ案件はまだありません'
            : 'ボット対応中のルームはまだありません'}
        </div>
      ) : (
        <AdminReceptionRoomListLive
          initial_rooms={rooms}
          reception_state={reception_state}
        />
      )}
    </div>
  )
}
