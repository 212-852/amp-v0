'use client'

import { useState } from 'react'

type AdminHandoffMemoProps = {
  room_uuid: string
  initial_memo: string
  initial_updated_at: string | null
}

type memo_response = {
  ok: boolean
  memo?: {
    handoff_memo: string
    handoff_memo_updated_at: string | null
  }
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
  const [updated_at, set_updated_at] = useState(initial_updated_at)
  const [is_open, set_is_open] = useState(Boolean(initial_memo))
  const [is_saving, set_is_saving] = useState(false)
  const [saved_message, set_saved_message] = useState<string | null>(null)

  const save = async () => {
    if (is_saving) {
      return
    }

    set_is_saving(true)
    set_saved_message(null)

    try {
      const response = await fetch(
        `/api/admin/reception/${room_uuid}/memo`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ memo }),
        },
      )

      if (!response.ok) {
        set_saved_message('保存できませんでした')
        return
      }

      const payload = (await response.json()) as memo_response

      if (payload.ok && payload.memo) {
        set_memo(payload.memo.handoff_memo)
        set_updated_at(payload.memo.handoff_memo_updated_at)
        set_saved_message('保存しました')
      } else {
        set_saved_message('保存できませんでした')
      }
    } catch {
      set_saved_message('保存できませんでした')
    } finally {
      set_is_saving(false)
    }
  }

  return (
    <section className="border-b border-neutral-200 bg-white px-6 py-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => set_is_open((current) => !current)}
      >
        <span className="text-[13px] font-semibold text-black">
          引き継ぎメモ
        </span>
        <span className="text-[11px] font-medium text-neutral-500">
          {is_open ? '閉じる' : memo ? '表示' : '追加'}
        </span>
      </button>

      {is_open ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={memo}
            maxLength={2000}
            onChange={(event) => set_memo(event.target.value)}
            placeholder="管理者向けのメモを入力"
            className="min-h-20 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-black placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-[11px] font-medium text-neutral-400">
              {saved_message ??
                (updated_at ? `更新: ${format_time(updated_at)}` : '')}
            </div>
            <button
              type="button"
              className="rounded-full bg-black px-4 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
              disabled={is_saving}
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
