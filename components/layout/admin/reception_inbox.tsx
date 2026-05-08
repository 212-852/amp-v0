import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { list_active_reception_rooms } from '@/lib/admin/reception/action'
import type { reception_room_summary } from '@/lib/admin/reception/rules'

import AdminReceptionInboxItem from '@/components/admin/reception/inbox_item'

const MAX_ITEMS = 3

async function load_inbox_rooms(): Promise<reception_room_summary[]> {
  try {
    return await list_active_reception_rooms({ limit: MAX_ITEMS })
  } catch (error) {
    console.error('[admin_reception_inbox] load_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export default async function AdminReceptionInbox() {
  const rooms = await load_inbox_rooms()

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
