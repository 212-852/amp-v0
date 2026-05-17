'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'

import AdminReceptionRoomListLive from '@/components/admin/reception/room_list_live'
import type { reception_state } from '@/lib/admin/reception/rules'
import type { reception_room } from '@/lib/admin/reception/types'

type reception_gate = {
  state: reception_state | 'loading' | 'closed'
  room_count: number
}

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
  const [gate, set_gate] = useState<reception_gate>({
    state,
    room_count: state === 'open' ? rooms.length : 0,
  })

  const reception_open = gate.state === 'open'

  return (
    <section
      aria-label="Admin reception inbox"
      className="flex flex-col gap-2"
    >
      <AdminReceptionRoomListLive
        admin_user_uuid={admin_user_uuid}
        initial_rooms={rooms}
        limit={3}
        mode="concierge"
        on_reception_gate_change={set_gate}
      />

      {reception_open && gate.room_count === 0 ? (
        <div className="flex items-center justify-between rounded-2xl border border-dashed border-neutral-200 bg-white px-3 py-2 text-[12px] text-neutral-500">
          <span>対応中の案件はありません</span>
          <Link
            href="/admin/reception"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-black"
          >
            一覧へ
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </Link>
        </div>
      ) : null}

      {reception_open && gate.room_count > 0 ? (
        <div className="flex justify-end pr-1">
          <Link
            href="/admin/reception"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-black"
          >
            一覧へ
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </Link>
        </div>
      ) : null}
    </section>
  )
}
