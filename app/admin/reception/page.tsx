import Link from 'next/link'
import { ArrowRight, MessageCircle, Search } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  list_concierge_rooms,
  type concierge_room,
} from '@/lib/admin/reception/rooms'

export const dynamic = 'force-dynamic'

const PAGE_LIMIT = 50

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

  if (diff_day < 7) {
    return `${diff_day}日前`
  }

  return date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  })
}

function ReceptionShell({ children }: { children: ReactNode }) {
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
          <ArrowRight
            className="h-3 w-3 text-neutral-400"
            strokeWidth={2}
            aria-hidden
          />
          <span className="text-neutral-900">チャット一覧</span>
        </nav>
      </header>
      <section
        aria-label="Reception search"
        className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-300"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            inputMode="search"
            placeholder="検索 (準備中)"
            disabled
            aria-disabled
            className="block w-full cursor-not-allowed rounded-full border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-[13px] text-neutral-400 placeholder:text-neutral-300"
          />
        </div>
      </section>
      {children}
    </div>
  )
}

function RoomCard({ room }: { room: concierge_room }) {
  const short_id = room.room_uuid.slice(0, 8)
  const relative_time = format_relative_time(room.updated_at)

  return (
    <Link
      href={`/admin/reception/${room.room_uuid}`}
      className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
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

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
      コンシェルジュ案件はまだありません
    </div>
  )
}

function ErrorState() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
      チャット一覧を読み込めませんでした
    </div>
  )
}

export default async function AdminReceptionPage() {
  const result = await list_concierge_rooms({ limit: PAGE_LIMIT })

  if (!result.ok) {
    return (
      <ReceptionShell>
        <ErrorState />
      </ReceptionShell>
    )
  }

  if (result.rooms.length === 0) {
    return (
      <ReceptionShell>
        <EmptyState />
      </ReceptionShell>
    )
  }

  return (
    <ReceptionShell>
      <ul className="flex flex-col gap-2">
        {result.rooms.map((room) => (
          <li key={room.room_uuid}>
            <RoomCard room={room} />
          </li>
        ))}
      </ul>
    </ReceptionShell>
  )
}
