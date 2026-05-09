import Link from 'next/link'
import { ArrowRight, MessageCircle } from 'lucide-react'

import {
  list_concierge_rooms,
  type concierge_room,
} from '@/lib/admin/reception/rooms'

const MAX_ITEMS = 3

function format_relative_time(iso: string | null): string {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  const diff_ms = Date.now() - date.getTime()

  if (Number.isNaN(diff_ms)) {
    return ''
  }

  const diff_min = Math.floor(diff_ms / 60_000)

  if (diff_min < 1) {
    return 'たった今'
  }

  if (diff_min < 60) {
    return `${diff_min}分前`
  }

  const diff_hour = Math.floor(diff_min / 60)

  if (diff_hour < 24) {
    return `${diff_hour}時間前`
  }

  const diff_day = Math.floor(diff_hour / 24)

  return `${diff_day}日前`
}

function MiniRoomItem({ room }: { room: concierge_room }) {
  const short_id = room.room_uuid.slice(0, 8)
  const relative_time = format_relative_time(room.updated_at)

  return (
    <Link
      href={`/admin/reception/${room.room_uuid}`}
      className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white px-3 py-2.5 transition-colors hover:border-neutral-200 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
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
            Concierge room
          </span>
          {relative_time ? (
            <span className="shrink-0 text-[11px] font-medium leading-none text-neutral-400">
              {relative_time}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[12px] leading-tight text-neutral-500">
          対応が必要です
        </p>
        <p className="mt-1 truncate text-[10px] font-mono leading-none text-neutral-400">
          {short_id}
        </p>
      </div>
    </Link>
  )
}

function ListLink() {
  return (
    <div className="flex justify-end pr-1 pt-1">
      <Link
        href="/admin/reception"
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 transition-colors hover:text-black"
      >
        一覧へ
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </Link>
    </div>
  )
}

export default async function AdminReceptionInbox() {
  const result = await list_concierge_rooms({ limit: MAX_ITEMS })
  const rooms = result.ok ? result.rooms.slice(0, MAX_ITEMS) : []

  if (rooms.length === 0) {
    return (
      <section
        aria-label="Reception inbox"
        className="flex items-center justify-between rounded-2xl border border-dashed border-neutral-200 bg-white px-3 py-2 text-[12px] text-neutral-500"
      >
        <span>
          {result.ok
            ? '対応中の案件はありません'
            : 'チャット一覧を読み込めませんでした'}
        </span>
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
            <MiniRoomItem room={room} />
          </li>
        ))}
      </ul>
      <ListLink />
    </section>
  )
}
