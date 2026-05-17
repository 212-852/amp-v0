'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { useState } from 'react'

import AdminReceptionRoomListLive from '@/components/admin/reception/room_list_live'
import type { reception_state } from '@/lib/admin/reception/rules'
import type {
  reception_room,
  reception_room_mode,
} from '@/lib/admin/reception/room'

type admin_reception_list_props = {
  admin_user_uuid: string
  initial_state: reception_state
  initial_rooms: reception_room[]
  mode: reception_room_mode
  load_ok: boolean
}

type reception_gate = {
  state: reception_state | 'loading' | 'closed'
  room_count: number
}

const tabs: Array<{ mode: reception_room_mode; label: string }> = [
  { mode: 'concierge', label: 'コンシェルジュ' },
  { mode: 'bot', label: 'ボット' },
]

export default function AdminReceptionList({
  admin_user_uuid,
  initial_state,
  initial_rooms,
  mode,
  load_ok,
}: admin_reception_list_props) {
  const [gate, set_gate] = useState<reception_gate>({
    state: initial_state,
    room_count: initial_state === 'open' ? initial_rooms.length : 0,
  })

  const reception_open = gate.state === 'open'

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

      <AdminReceptionRoomListLive
        admin_user_uuid={admin_user_uuid}
        initial_rooms={initial_rooms}
        mode={mode}
        on_reception_gate_change={set_gate}
      />

      {!reception_open ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          Chat reception is OFF
        </div>
      ) : !load_ok ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          チャット一覧を読み込めませんでした
        </div>
      ) : gate.room_count === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          {mode === 'concierge'
            ? 'コンシェルジュ案件はまだありません'
            : 'ボット対応中のルームはまだありません'}
        </div>
      ) : null}
    </div>
  )
}
