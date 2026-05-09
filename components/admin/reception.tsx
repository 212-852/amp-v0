import { MessageCircle } from 'lucide-react'

import type { reception_room } from '@/lib/admin/reception/room'

type AdminReceptionProps = {
  rooms: reception_room[]
}

function format_time(iso: string | null): string {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminReception({ rooms }: AdminReceptionProps) {
  if (rooms.length === 0) {
    return (
      <section
        aria-label="Admin reception inbox"
        className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm font-medium text-neutral-500"
      >
        対応中の案件はありません
      </section>
    )
  }

  return (
    <section
      aria-label="Admin reception inbox"
      className="flex flex-col gap-2"
    >
      <ul className="flex flex-col gap-2">
        {rooms.map((room) => (
          <li
            key={room.room_uuid}
            className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
              aria-hidden
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-semibold leading-tight text-black">
                  {room.title}
                </span>
                <span className="shrink-0 text-[11px] font-medium leading-none text-neutral-400">
                  {format_time(room.updated_at)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[12px] leading-tight text-neutral-600">
                {room.preview}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
