'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { save_reception_room_memo } from '@/lib/admin/reception/memo/client'

type AdminHandoffMemoProps = {
  room_uuid: string
  initial_memo: string
  initial_updated_at: string | null
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

export default function AdminHandoffMemo({
  room_uuid,
  initial_memo,
  initial_updated_at,
}: AdminHandoffMemoProps) {
  const [memo, set_memo] = useState(initial_memo)
  const [draft, set_draft] = useState(initial_memo)
  const [updated_at, set_updated_at] = useState(initial_updated_at)
  const [is_open, set_is_open] = useState(false)
  const [is_saving, set_is_saving] = useState(false)
  const [error_message, set_error_message] = useState<string | null>(null)

  const is_dirty = draft !== memo
  const status_text = is_saving ? '保存中...' : is_dirty ? '未保存' : '保存済み'
  const updated_time = format_time(updated_at)

  const toggle_open = () => {
    set_is_open((current) => !current)
  }

  const save = async () => {
    if (is_saving) {
      return
    }

    set_is_saving(true)
    set_error_message(null)

    try {
      const result = await save_reception_room_memo({
        room_uuid,
        memo: draft,
      })

      if (result.ok) {
        const next_memo = result.memo
        set_memo(next_memo)
        set_draft(next_memo)
        set_updated_at(result.updated_at)
      } else {
        set_error_message('保存できませんでした')
      }
    } catch {
      set_error_message('保存できませんでした')
    } finally {
      set_is_saving(false)
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        aria-expanded={is_open}
        onClick={toggle_open}
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-tight text-black">
            引き継ぎメモ
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium leading-tight text-neutral-500">
            <span>{updated_time ? `更新: ${updated_time}` : '未更新'}</span>
            <span aria-hidden>{'/'}</span>
            <span
              className={
                is_dirty && !is_saving ? 'text-amber-700' : 'text-neutral-500'
              }
            >
              {status_text}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${
            is_open ? 'rotate-180' : ''
          }`}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {is_open ? (
        <div className="border-t border-neutral-200 px-3 pb-3 pt-3">
          <textarea
            value={draft}
            maxLength={2000}
            onChange={(event) => {
              set_draft(event.target.value)
              set_error_message(null)
            }}
            placeholder="管理者向けのメモを入力"
            className="min-h-32 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-black placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0 text-[11px] font-medium text-red-600">
              {error_message}
            </div>
            <button
              type="button"
              className="rounded-full bg-black px-4 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
              disabled={is_saving || !is_dirty}
              onClick={() => {
                void save()
              }}
            >
              保存
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
