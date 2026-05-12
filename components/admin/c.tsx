'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import PawIcon from '@/components/icons/paw'
import type { reception_room_message } from '@/lib/admin/reception/room'
import { archived_message_from_message_row } from '@/lib/chat/realtime/row'
import type { message_insert_row } from '@/lib/chat/realtime/row'
import { create_browser_supabase } from '@/lib/db/browser'

type AdminChatTimelineProps = {
  messages: reception_room_message[]
  load_failed: boolean
  room_uuid: string
  staff_participant_uuid: string
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

function merge_timeline_rows(
  previous: reception_room_message[],
  addition: reception_room_message[],
): reception_room_message[] {
  const seen = new Set(previous.map((row) => row.message_uuid))
  const merged = [...previous]

  for (const row of addition) {
    if (seen.has(row.message_uuid)) {
      continue
    }

    seen.add(row.message_uuid)
    merged.push(row)
  }

  return merged.sort(compare_timeline_asc)
}

function is_outgoing_message(message: reception_room_message): boolean {
  if (message.direction === 'system') {
    return false
  }

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

  if (bundle.bundle_type === 'room_action_log') {
    const actor =
      bundle.metadata &&
      typeof bundle.metadata.actor_display_name === 'string'
        ? bundle.metadata.actor_display_name.trim() || 'action'
        : 'action'

    return {
      message_uuid: row.archive_uuid,
      room_uuid: row.room_uuid,
      direction: 'system',
      sender: 'system',
      role: actor,
      text:
        bundle.payload?.text !== undefined
          ? String(bundle.payload.text).trim()
          : '',
      created_at: row.created_at,
      sequence: row.sequence,
      bundle_type: 'room_action_log',
    }
  }

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
    bundle_type: bundle.bundle_type ?? null,
  }
}

export default function AdminChatTimeline({
  messages: initial_messages,
  load_failed,
  room_uuid,
  staff_participant_uuid,
}: AdminChatTimelineProps) {
  const bottom_ref = useRef<HTMLDivElement | null>(null)
  const [rows, set_rows] = useState(() =>
    [...initial_messages].sort(compare_timeline_asc),
  )
  const [reply_text, set_reply_text] = useState('')
  const [is_sending, set_is_sending] = useState(false)
  const [typing_lines, set_typing_lines] = useState<string[]>([])
  const typing_timer_ref = useRef<number | null>(null)
  const typing_active_ref = useRef(false)

  useEffect(() => {
    set_rows([...initial_messages].sort(compare_timeline_asc))
  }, [initial_messages])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      bottom_ref.current?.scrollIntoView({ block: 'end' })
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [rows.length])

  useEffect(() => {
    if (!room_uuid) {
      return
    }

    void fetch('/api/chat/reception/open', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room_uuid }),
    }).catch(() => {})
  }, [room_uuid])

  const refresh_typing_lines = useCallback(async () => {
    if (!room_uuid || !staff_participant_uuid) {
      set_typing_lines([])

      return
    }

    try {
      const query = new URLSearchParams({
        room_uuid,
        viewer_participant_uuid: staff_participant_uuid,
      })
      const response = await fetch(`/api/chat/room/typing?${query.toString()}`, {
        credentials: 'include',
      })
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; lines?: string[] }
        | { ok: false }
        | null

      if (!response.ok || !payload || payload.ok !== true) {
        return
      }

      set_typing_lines(payload.lines ?? [])
    } catch {
      set_typing_lines([])
    }
  }, [room_uuid, staff_participant_uuid])

  const schedule_typing_refresh = useCallback(() => {
    if (typing_timer_ref.current !== null) {
      window.clearTimeout(typing_timer_ref.current)
    }

    typing_timer_ref.current = window.setTimeout(() => {
      typing_timer_ref.current = null
      void refresh_typing_lines()
    }, 280)
  }, [refresh_typing_lines])

  useEffect(() => {
    if (!room_uuid || !staff_participant_uuid) {
      return
    }

    void refresh_typing_lines()

    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const channel = supabase
      .channel(`admin_room_participants:${room_uuid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'participants',
          filter: `room_uuid=eq.${room_uuid}`,
        },
        () => {
          schedule_typing_refresh()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [room_uuid, staff_participant_uuid, refresh_typing_lines, schedule_typing_refresh])

  useEffect(() => {
    if (!room_uuid) {
      return
    }

    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    const channel = supabase
      .channel(`admin_room_messages:${room_uuid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_uuid=eq.${room_uuid}`,
        },
        (payload) => {
          const archived = archived_message_from_message_row(
            payload.new as message_insert_row,
          )

          if (!archived) {
            return
          }

          const mapped = archived_payload_to_reception_message({
            archive_uuid: archived.archive_uuid,
            room_uuid: archived.room_uuid,
            sequence: archived.sequence,
            created_at: archived.created_at,
            bundle: archived.bundle as message_bundle_payload,
          })

          set_rows((previous) => merge_timeline_rows(previous, [mapped]))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [room_uuid])

  const post_typing_presence = useCallback(
    (action: 'typing_start' | 'typing_stop') => {
      if (!room_uuid || !staff_participant_uuid) {
        return
      }

      if (action === 'typing_start' && typing_active_ref.current) {
        return
      }

      typing_active_ref.current = action === 'typing_start'

      void fetch('/api/chat/presence', {
        method: 'POST',
        credentials: 'include',
        keepalive: action === 'typing_stop',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          room_uuid,
          participant_uuid: staff_participant_uuid,
          action,
        }),
      }).catch(() => {})
    },
    [room_uuid, staff_participant_uuid],
  )

  useEffect(() => {
    return () => {
      if (typing_timer_ref.current !== null) {
        window.clearTimeout(typing_timer_ref.current)
      }

      post_typing_presence('typing_stop')
    }
  }, [post_typing_presence])

  async function submit_reply(raw_text: string) {
    const text = raw_text.trim()

    if (!text || is_sending || !room_uuid) {
      return
    }

    post_typing_presence('typing_stop')
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

      set_rows((previous) => merge_timeline_rows(previous, mapped))
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
      <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-6 pb-24 pt-3">
        {typing_lines.length > 0 ? (
          <div className="mb-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-[12px] font-medium text-neutral-600">
            {typing_lines.join(' / ')}
          </div>
        ) : null}
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
              if (message.bundle_type === 'room_action_log') {
                return (
                  <li
                    key={message.message_uuid}
                    className="flex justify-center px-2"
                  >
                    <div className="max-w-[92%] rounded-full bg-neutral-100 px-4 py-1.5 text-center text-[11px] font-medium text-neutral-600">
                      {message.text}
                    </div>
                  </li>
                )
              }

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
            type="text"
            name="admin_reception_reply"
            value={reply_text}
            onChange={(event) => {
              const value = event.target.value
              set_reply_text(value)

              if (value.trim().length > 0) {
                post_typing_presence('typing_start')
              } else {
                post_typing_presence('typing_stop')
              }
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
