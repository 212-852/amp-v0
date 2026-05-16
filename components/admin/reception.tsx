import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import AdminReceptionRoomListLive from '@/components/admin/reception/room_list_live'
import { AdminRenderProbe } from '@/components/admin/render_probe'
import type { reception_room } from '@/lib/admin/reception/room'

type AdminReceptionProps = {
  rooms: reception_room[]
  state: 'open' | 'offline'
}

export default function AdminReception({ rooms, state }: AdminReceptionProps) {
  if (state === 'offline') {
    return null
  }

  if (rooms.length === 0) {
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
      data-debug-component="components/admin/reception.tsx"
    >
      <AdminRenderProbe file_path="components/admin/reception.tsx" />
      <div data-debug-component="components/admin/reception.tsx">
        DEBUG_ADMIN_CHAT_COMPONENT_components/admin/reception.tsx
      </div>
      <AdminReceptionRoomListLive initial_rooms={rooms} limit={3} />
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
