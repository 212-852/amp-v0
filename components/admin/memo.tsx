'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { save_reception_room_memo } from '@/lib/admin/reception/memo/client'
import type { handoff_memo } from '@/lib/chat/handoff'

type AdminHandoffMemoProps = {
  room_uuid: string
  initial_memos: handoff_memo[]
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

function memo_actor_name(memo: handoff_memo | null): string {
  return memo?.saved_by_name?.trim() ?? ''
}

function memo_actor_line(memo: handoff_memo | null): string {
  const name = memo_actor_name(memo)

  return name.length > 0 ? `${name} が追加` : 'メモを追加'
}

export default function AdminHandoffMemo({
  room_uuid,
  initial_memos,
}: AdminHandoffMemoProps) {
  const [memos, set_memos] = useState(initial_memos)
  const [draft, set_draft] = useState('')
  const [is_open, set_is_open] = useState(false)
  const [is_saving, set_is_saving] = useState(false)
  const [error_message, set_error_message] = useState<string | null>(null)

  const is_dirty = draft.trim().length > 0
  const latest_memo = memos[0] ?? null
  const status_text = is_saving ? '保存中...' : is_dirty ? '未保存' : '保存済み'
  const updated_time = format_time(latest_memo?.created_at ?? null)
  const saved_by = latest_memo ? memo_actor_line(latest_memo) : null

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
        set_memos((current) => [...current, result.memo])
        set_draft('')
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
            {saved_by ? (
              <>
                <span aria-hidden>{'/'}</span>
                <span>{saved_by}</span>
              </>
            ) : null}
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
        <div className="flex max-h-[70svh] flex-col border-t border-neutral-200 px-3 pb-3 pt-3">
          <div className="max-h-[32svh] overflow-y-auto pr-1">
            {memos.length > 0 ? (
              <ol className="flex flex-col gap-2">
                {memos.map((memo_item) => {
                  const item_saved_by = memo_actor_line(memo_item)
                  const item_time = format_time(memo_item.created_at)

                  return (
                    <li
                      key={memo_item.memo_uuid}
                      className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-neutral-500">
                        <span>{item_saved_by}</span>
                        {item_time ? (
                          <>
                            <span aria-hidden>{'/'}</span>
                            <span>{item_time}</span>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-2 max-h-[22svh] overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-6 text-black">
                        {memo_item.body}
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <div className="rounded-lg border border-dashed border-neutral-200 px-3 py-6 text-center text-[12px] font-medium text-neutral-500">
                引き継ぎメモはまだありません
              </div>
            )}
          </div>

          <textarea
            value={draft}
            maxLength={2000}
            onChange={(event) => {
              set_draft(event.target.value)
              set_error_message(null)
            }}
            placeholder="管理者向けのメモを入力"
            className="mt-3 max-h-[26svh] min-h-[160px] w-full resize-y overflow-y-auto rounded-lg border border-neutral-200 bg-white px-4 py-3 text-[13px] leading-7 text-black placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900"
          />

          <div className="sticky bottom-0 mt-3 flex items-center justify-between gap-3 bg-white pt-1">
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
