import Link from 'next/link'
import { ArrowRight, MessageCircle } from 'lucide-react'

import type { reception_room } from '@/lib/admin/reception/room'

type AdminReceptionProps = {
  rooms: reception_room[]
  state: 'open' | 'offline'
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
    >
      <ul className="flex flex-col gap-2">
        {rooms.map((room) => (
          <li key={room.room_uuid}>
            <Link
              href={`/admin/reception/${room.room_uuid}`}
              className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-700"
                aria-hidden
              >
                {room.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={room.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : room.display_name ? (
                  <span className="text-[12px] font-semibold">
                    {room.display_name.slice(0, 1)}
                  </span>
                ) : (
                  <MessageCircle className="h-4 w-4" strokeWidth={2} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold leading-tight text-black">
                    {room.display_name}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium leading-none text-neutral-400">
                    {format_time(room.updated_at)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] leading-tight text-neutral-600">
                  {room.preview}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
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
