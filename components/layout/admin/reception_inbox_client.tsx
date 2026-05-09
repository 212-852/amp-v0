'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import AdminReceptionInboxItem from '@/components/admin/reception/inbox_item'
import type { reception_room_summary } from '@/lib/admin/reception/rules'
import { create_browser_supabase } from '@/lib/db/browser'

const MAX_ITEMS = 3

type rooms_response = {
  ok: boolean
  rooms?: reception_room_summary[]
}

export default function AdminReceptionInboxClient({
  initial_rooms,
}: {
  initial_rooms: reception_room_summary[]
}) {
  const [rooms, set_rooms] =
    useState<reception_room_summary[]>(initial_rooms)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        '/api/admin/reception/rooms?status_mode=concierge',
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        },
      )

      if (!response.ok) {
        return
      }

      const payload = (await response.json()) as rooms_response

      if (payload.ok && Array.isArray(payload.rooms)) {
        set_rooms(payload.rooms.slice(0, MAX_ITEMS))
      }
    } catch {
      // Keep the last successful list.
    }
  }, [])

  useEffect(() => {
    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const channel = supabase
      .channel('admin_reception_mini_presence')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
        },
        () => {
          void refresh()
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          void refresh()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refresh])

  if (rooms.length === 0) {
    return (
      <section
        aria-label="Reception inbox"
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
      aria-label="Reception inbox"
      className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
    >
      <ul className="flex flex-col">
        {rooms.map((room) => (
          <li key={room.room_uuid}>
            <AdminReceptionInboxItem room={room} variant="mini" />
          </li>
        ))}
      </ul>
      <div className="flex justify-end pr-1 pt-1">
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
