'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import AdminReceptionRoomListLive from '@/components/admin/reception/room_list_live'
import { use_admin_reception } from '@/components/admin/reception/provider'
import type { reception_room } from '@/lib/admin/reception/types'

type rooms_api_response = {
  ok?: boolean
  rooms?: reception_room[]
}

export default function AdminReception() {
  const { admin_user_uuid, reception_state } = use_admin_reception()
  const [visible_rooms, set_visible_rooms] = useState<reception_room[]>([])

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

    if (!payload?.ok || !Array.isArray(payload.rooms)) {
      throw new Error('admin_top_rooms_invalid_payload')
    }

    set_visible_rooms(payload.rooms.slice(0, 3))
  }, [])

  useEffect(() => {
    if (reception_state !== 'open') {
      set_visible_rooms([])
      return
    }

    void load_rooms().catch(() => {
      set_visible_rooms([])
    })
  }, [load_rooms, reception_state])

  return (
    <section
      aria-label="Admin reception inbox"
      className="flex flex-col gap-2"
      data-debug="actual_admin_top_renderer"
    >
      {visible_rooms.length === 0 ? (
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
      ) : (
        <>
          <AdminReceptionRoomListLive
            admin_user_uuid={admin_user_uuid}
            initial_rooms={visible_rooms}
            limit={3}
            mode="concierge"
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
        </>
      )}
    </section>
  )
}
