import Link from 'next/link'
import { MessageCircle, Search } from 'lucide-react'

import {
  list_reception_rooms,
  type reception_room,
  type reception_room_mode,
} from '@/lib/admin/reception/room'

export const dynamic = 'force-dynamic'

type AdminReceptionPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const tabs: Array<{ mode: reception_room_mode; label: string }> = [
  { mode: 'concierge', label: 'コンシェルジュ' },
  { mode: 'bot', label: 'ボット' },
]

function parse_mode(value: unknown): reception_room_mode {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'bot' ? 'bot' : 'concierge'
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

async function load_rooms(
  mode: reception_room_mode,
): Promise<{ ok: true; rooms: reception_room[] } | { ok: false; rooms: [] }> {
  try {
    return {
      ok: true,
      rooms: await list_reception_rooms({ mode, limit: 50 }),
    }
  } catch (error) {
    console.error('[admin_reception_page] list_reception_rooms_failed', {
      mode,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      ok: false,
      rooms: [],
    }
  }
}

export default async function AdminReceptionPage({
  searchParams,
}: AdminReceptionPageProps) {
  const params = await searchParams
  const selected_mode = parse_mode(params?.mode)
  const result = await load_rooms(selected_mode)
  const rooms = result.rooms

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
          const is_selected = tab.mode === selected_mode

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

      {!result.ok ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          チャット一覧を読み込めませんでした
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          {selected_mode === 'concierge'
            ? 'コンシェルジュ案件はまだありません'
            : 'ボット対応中のルームはありません'}
        </div>
      ) : (
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
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium leading-none text-neutral-500">
                    <span className="font-mono text-neutral-400">
                      {room.room_uuid.slice(0, 8)}
                    </span>
                    {room.mode ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700">
                        {room.mode}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
