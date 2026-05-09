'use client'

import { useEffect, useRef } from 'react'

import type { reception_room_message } from '@/lib/admin/reception/room'

type AdminChatTimelineProps = {
  messages: reception_room_message[]
  load_failed: boolean
}

function is_outgoing_message(message: reception_room_message): boolean {
  return (
    message.direction === 'outgoing' ||
    message.sender === 'admin' ||
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

export default function AdminChatTimeline({
  messages,
  load_failed,
}: AdminChatTimelineProps) {
  const container_ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const container = container_ref.current

      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [messages.length])

  return (
    <div
      ref={container_ref}
      className="min-h-0 w-full flex-1 overflow-y-auto px-6 py-3"
    >
      {load_failed ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm font-medium text-neutral-500">
          メッセージを読み込めませんでした
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm font-medium text-neutral-500">
          メッセージはまだありません
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {messages.map((message) => {
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
        </ol>
      )}
    </div>
  )
}
