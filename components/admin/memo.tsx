'use client'

import { useEffect, useState } from 'react'

type AdminHandoffMemoProps = {
  room_uuid: string
  initial_memo: string
  initial_updated_at: string | null
}

type memo_response = {
  ok: boolean
  memo?: string
  updated_at?: string | null
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
  const [saved_message, set_saved_message] = useState<string | null>(null)

  useEffect(() => {
    if (!is_open) {
      return
    }

    const handle_key_down = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        set_is_open(false)
      }
    }

    window.addEventListener('keydown', handle_key_down)

    return () => {
      window.removeEventListener('keydown', handle_key_down)
    }
  }, [is_open])

  const open_modal = () => {
    set_draft(memo)
    set_saved_message(null)
    set_is_open(true)
  }

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
          body: JSON.stringify({ memo: draft }),
        },
      )

      if (!response.ok) {
        set_saved_message('保存できませんでした')
        return
      }

      const payload = (await response.json()) as memo_response

      if (payload.ok) {
        const next_memo = payload.memo ?? ''
        set_memo(next_memo)
        set_draft(next_memo)
        set_updated_at(payload.updated_at ?? null)
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
    <>
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          onClick={open_modal}
        >
          引き継ぎメモ
        </button>
        {memo ? (
          <span className="text-[11px] font-medium text-neutral-400">
            保存済み
          </span>
        ) : null}
      </div>

      {is_open ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/40 px-5">
          <button
            type="button"
            aria-label="Close handoff memo"
            className="absolute inset-0"
            onClick={() => set_is_open(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="引き継ぎメモ"
            className="relative z-[181] flex w-full max-w-[420px] flex-col rounded-2xl bg-white p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-black">
                  引き継ぎメモ
                </h2>
                {updated_at ? (
                  <p className="mt-1 text-[11px] font-medium text-neutral-400">
                    更新: {format_time(updated_at)}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-100"
                onClick={() => set_is_open(false)}
              >
                閉じる
              </button>
            </div>

            <textarea
              value={draft}
              maxLength={2000}
              onChange={(event) => set_draft(event.target.value)}
              placeholder="管理者向けのメモを入力"
              className="mt-4 min-h-40 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-black placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0 text-[11px] font-medium text-neutral-400">
                {saved_message}
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
          </section>
        </div>
      ) : null}
    </>
  )
}
