'use client'

import { useEffect, useRef, useState } from 'react'

import PawIcon from '@/components/icons/paw'
import type { reception_room_message } from '@/lib/admin/reception/room'

type AdminChatTimelineProps = {
  messages: reception_room_message[]
  load_failed: boolean
  room_uuid: string
}

function compare_timeline_asc(
  a: reception_room_message,
  b: reception_room_message,
): number {
  if (a.sequence !== null && b.sequence !== null) {
    return a.sequence - b.sequence
  }

  if (a.sequence !== null) {
    return -1
  }

  if (b.sequence !== null) {
    return 1
  }

  return (
    new Date(a.created_at ?? 0).getTime() -
    new Date(b.created_at ?? 0).getTime()
  )
}

function is_outgoing_message(message: reception_room_message): boolean {
  return (
    message.direction === 'outgoing' ||
    message.sender === 'admin' ||
    message.sender === 'concierge' ||
    message.sender === 'bot' ||
    message.sender === 'system' ||
    message.role === 'admin' ||
    message.role === 'bot' ||
    message.role === 'system'
  )
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

type message_bundle_payload = {
  bundle_type?: string
  sender?: string
  payload?: { text?: string }
  metadata?: Record<string, unknown>
}

function archived_payload_to_reception_message(row: {
  archive_uuid: string
  room_uuid: string
  sequence: number
  created_at: string
  bundle: message_bundle_payload
}): reception_room_message {
  const bundle = row.bundle
  const sender = typeof bundle.sender === 'string' ? bundle.sender : 'bot'
  const direction = sender === 'user' ? 'incoming' : 'outgoing'
  let text = ''

  if (bundle.bundle_type === 'text' && bundle.payload?.text) {
    text = String(bundle.payload.text).trim()
  }

  const role =
    bundle.bundle_type === 'text' &&
    bundle.metadata &&
    typeof bundle.metadata.sender_display_name === 'string'
      ? bundle.metadata.sender_display_name.trim() || sender
      : sender

  return {
    message_uuid: row.archive_uuid,
    room_uuid: row.room_uuid,
    direction,
    sender,
    role,
    text,
    created_at: row.created_at,
    sequence: row.sequence,
  }
}

export default function AdminChatTimeline({
  messages: initial_messages,
  load_failed,
  room_uuid,
}: AdminChatTimelineProps) {
  const bottom_ref = useRef<HTMLDivElement | null>(null)
  const input_ref = useRef<HTMLInputElement | null>(null)
  const [rows, set_rows] = useState(() =>
    [...initial_messages].sort(compare_timeline_asc),
  )
  const [reply_text, set_reply_text] = useState('')
  const [is_sending, set_is_sending] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      bottom_ref.current?.scrollIntoView({ block: 'end' })
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [rows.length])

  async function submit_reply(raw_text: string) {
    const text = raw_text.trim()

    if (!text || is_sending || !room_uuid) {
      return
    }

    set_is_sending(true)

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          source: 'admin_reception',
          room_uuid,
          text,
          locale: 'ja',
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            ok: true
            kind: string
            messages?: Array<{
              archive_uuid: string
              room_uuid: string
              sequence: number
              created_at: string
              bundle: message_bundle_payload
            }>
          }
        | { ok: false; error?: string }
        | null

      if (!response.ok || !payload || payload.ok !== true) {
        return
      }

      const returned = payload.messages ?? []

      if (returned.length === 0) {
        return
      }

      const mapped = returned.map(archived_payload_to_reception_message)

      set_rows((previous) =>
        [...previous, ...mapped].sort(compare_timeline_asc),
      )

      if (input_ref.current) {
        input_ref.current.value = ''
      }

      set_reply_text('')
    } catch (error) {
      console.error('[admin_reception] submit_reply_failed', error)
    } finally {
      set_is_sending(false)
    }
  }

  function handle_submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit_reply(reply_text)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-6 pb-24 pt-3"
      >
        {load_failed ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm font-medium text-neutral-500">
            メッセージを読み込めませんでした
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm font-medium text-neutral-500">
            メッセージはまだありません
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((message) => {
              const is_outgoing = is_outgoing_message(message)
              const timestamp = format_time(message.created_at)

              return (
                <li
                  key={message.message_uuid}
                  className={`flex ${is_outgoing ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                      is_outgoing
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-black'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">
                      {message.text}
                    </div>
                    <div
                      className={`mt-1 text-[10px] font-medium ${
                        is_outgoing ? 'text-neutral-300' : 'text-neutral-400'
                      }`}
                    >
                      {message.role ?? message.sender ?? 'message'}
                      {timestamp ? ` - ${timestamp}` : ''}
                    </div>
                  </div>
                </li>
              )
            })}
            <li aria-hidden className="h-1">
              <div ref={bottom_ref} />
            </li>
          </ol>
        )}
      </div>

      <footer className="shrink-0 border-t border-neutral-200 bg-white pb-[max(8px,env(safe-area-inset-bottom,0px))] pt-2">
        <form
          className="flex items-center gap-3 px-4 pb-2"
          onSubmit={handle_submit}
        >
          <input
            ref={input_ref}
            type="text"
            name="admin_reception_reply"
            value={reply_text}
            onChange={(event) => {
              set_reply_text(event.target.value)
            }}
            autoComplete="off"
            enterKeyHint="send"
            placeholder="返信を入力"
            disabled={is_sending}
            className="h-12 min-w-0 flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400 focus-visible:border-neutral-400 disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="send"
            disabled={is_sending || reply_text.trim().length === 0}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3ebe2] shadow-[0_2px_8px_rgba(42,29,24,0.06)] disabled:opacity-60"
          >
            <div className="h-[22px] w-[22px]">
              <PawIcon className="text-[#9b6b4b]" />
            </div>
          </button>
        </form>
      </footer>
    </div>
  )
}
