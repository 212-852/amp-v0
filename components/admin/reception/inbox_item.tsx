import Link from 'next/link'
import { MessageCircle } from 'lucide-react'

import type { reception_room_summary } from '@/lib/admin/reception/rules'

type AdminReceptionInboxItemProps = {
  room: reception_room_summary
  variant?: 'mini' | 'full'
}

const channel_label: Record<string, string> = {
  web: 'Web',
  line: 'LINE',
  liff: 'LIFF',
  pwa: 'PWA',
}

const mode_label: Record<string, string> = {
  concierge: 'コンシェルジュ',
  bot: 'ボット',
}

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

export default function AdminReceptionInboxItem({
  room,
  variant = 'mini',
}: AdminReceptionInboxItemProps) {
  const display_name = room.display_name?.trim() || 'ゲスト'
  const channel = room.channel ? channel_label[room.channel] ?? room.channel : null
  const mode = room.mode ? mode_label[room.mode] ?? room.mode : null
  const preview = room.latest_message_text?.trim() || ''
  const relative_time = format_relative_time(
    room.latest_message_at ?? room.updated_at,
  )

  return (
    <Link
      href={`/admin/reception/${room.room_uuid}`}
      className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white px-3 py-2.5 text-left transition-colors hover:border-neutral-200 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
    >
      <div
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          room.is_pending
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-neutral-100 text-neutral-500'
        }`}
        aria-hidden
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2} />
        {room.is_pending ? (
          <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold leading-tight text-black">
            {display_name}
          </span>
          {relative_time ? (
            <span className="shrink-0 text-[11px] font-medium leading-none text-neutral-400">
              {relative_time}
            </span>
          ) : null}
        </div>
        {variant === 'mini' ? (
          <div className="mt-0.5 truncate text-[12px] leading-tight text-neutral-500">
            {preview || '(まだメッセージがありません)'}
          </div>
        ) : (
          <>
            <div className="mt-0.5 truncate text-[12px] leading-tight text-neutral-600">
              {preview || '(まだメッセージがありません)'}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium leading-none text-neutral-500">
              {mode ? (
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    room.mode === 'concierge'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {mode}
                </span>
              ) : null}
              {channel ? (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">
                  {channel}
                </span>
              ) : null}
              {room.status === 'active' ? null : (
                <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-neutral-600">
                  closed
                </span>
              )}
              {room.is_pending ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                  pending
                </span>
              ) : null}
              {room.has_typing ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                  typing
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Link>
  )
}
