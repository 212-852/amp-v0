'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import PawIcon from '@/components/icons/paw'
import type { reception_room_message } from '@/lib/admin/reception/room'
import {
  archived_message_to_timeline_message,
} from '@/lib/chat/timeline_display'
import type { message_bundle } from '@/lib/chat/message'
import {
  chat_room_realtime_channel_name,
  chat_typing_is_fresh,
  cleanup_chat_room_realtime,
  publish_chat_typing,
  send_chat_realtime_debug,
  subscribe_chat_room_realtime,
  sync_chat_typing_presence,
  type chat_typing_payload,
} from '@/lib/chat/realtime/client'
import { create_browser_supabase } from '@/lib/db/browser'
import { handle_chat_message_toast } from '@/lib/output/toast'
import {
  compute_message_list_near_bottom,
  resolve_realtime_message_subtitle_for_toast,
} from '@/lib/chat/realtime/toast_decision'
import type { RealtimeChannel } from '@supabase/supabase-js'

type AdminChatTimelineProps = {
  messages: reception_room_message[]
  load_failed: boolean
  room_uuid: string
  staff_participant_uuid: string
  staff_display_name: string
  staff_user_uuid: string | null
  staff_tier: string | null
  room_display_title: string
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
): {
  rows: reception_room_message[]
  prev_message_count: number
  next_message_count: number
  dedupe_hit: boolean
} {
  const seen = new Set(previous.map((row) => row.message_uuid))
  const merged = [...previous]
  let dedupe_hit = false

  for (const row of addition) {
    if (seen.has(row.message_uuid)) {
      dedupe_hit = true
      continue
    }

    seen.add(row.message_uuid)
    merged.push(row)
  }

  const rows = merged.sort(compare_timeline_asc)

  return {
    rows,
    prev_message_count: previous.length,
    next_message_count: rows.length,
    dedupe_hit,
  }
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
  return archived_message_to_timeline_message({
    archive_uuid: row.archive_uuid,
    room_uuid: row.room_uuid,
    sequence: row.sequence,
    created_at: row.created_at,
    bundle: row.bundle as message_bundle,
  })
}

export default function AdminChatTimeline({
  messages: initial_messages,
  load_failed,
  room_uuid,
  staff_participant_uuid,
  staff_display_name,
  staff_user_uuid,
  staff_tier,
  room_display_title,
}: AdminChatTimelineProps) {
  const bottom_ref = useRef<HTMLDivElement | null>(null)
  const message_list_scroll_ref = useRef<HTMLDivElement | null>(null)
  const realtime_channel_ref = useRef<RealtimeChannel | null>(null)
  const typing_rows_ref = useRef<Map<string, chat_typing_payload>>(new Map())
  const [rows, set_rows] = useState(() =>
    [...initial_messages].sort(compare_timeline_asc),
  )
  const [reply_text, set_reply_text] = useState('')
  const [is_sending, set_is_sending] = useState(false)
  const [typing_lines, set_typing_lines] = useState<string[]>([])
  const typing_timer_ref = useRef<number | null>(null)
  const publish_typing_timer_ref = useRef<number | null>(null)
  const typing_active_ref = useRef(false)

  const staff_participant_uuid_ref = useRef(staff_participant_uuid)

  const latest_room_uuid_ref = useRef(room_uuid)

  const admin_rt_ctx_ref = useRef({
    staff_participant_uuid,
    staff_user_uuid,
    staff_tier,
  })

  const active_typing_identity_ref = useRef({
    user_uuid: null as string | null,
    participant_uuid: null as string | null,
    role: null as string | null,
  })

  const set_rows_ref = useRef(set_rows)

  const subscribed_room_uuid_ref = useRef<string | null>(null)

  useEffect(() => {
    staff_participant_uuid_ref.current = staff_participant_uuid
    latest_room_uuid_ref.current = room_uuid
    admin_rt_ctx_ref.current = {
      staff_participant_uuid,
      staff_user_uuid,
      staff_tier,
    }
    active_typing_identity_ref.current = {
      user_uuid: staff_user_uuid,
      participant_uuid: staff_participant_uuid,
      role: 'admin',
    }
    set_rows_ref.current = set_rows
  }, [room_uuid, staff_participant_uuid, staff_tier, staff_user_uuid])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      bottom_ref.current?.scrollIntoView({ block: 'end' })
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [rows.length, typing_lines.length])

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

  const refresh_typing_lines = useCallback(() => {
    const now = new Date()
    const lines: string[] = []
    const staff = staff_participant_uuid_ref.current

    for (const typing of typing_rows_ref.current.values()) {
      if (typing.participant_uuid === staff) {
        continue
      }

      if (
        !chat_typing_is_fresh({
          is_typing: typing.is_typing,
          sent_at: typing.sent_at,
          now,
        })
      ) {
        continue
      }

      if (typing.role === 'user') {
        lines.push('ユーザーが入力中...')
      } else if (typing.role === 'admin' || typing.role === 'concierge') {
        const name = typing.display_name?.trim() || 'Admin'
        lines.push(`${name} が入力中...`)
      }
    }

    set_typing_lines(Array.from(new Set(lines)))
  }, [])

  const schedule_typing_refresh = useCallback(() => {
    if (typing_timer_ref.current !== null) {
      window.clearTimeout(typing_timer_ref.current)
    }

    typing_timer_ref.current = window.setTimeout(() => {
      typing_timer_ref.current = null
      refresh_typing_lines()
    }, 3_100)
  }, [refresh_typing_lines])

  useEffect(() => {
    if (!room_uuid) {
      return
    }

    const supabase = create_browser_supabase()

    if (!supabase) {
      return
    }

    if (
      subscribed_room_uuid_ref.current === room_uuid &&
      realtime_channel_ref.current
    ) {
      const ctx = admin_rt_ctx_ref.current

      send_chat_realtime_debug({
        event: 'chat_realtime_subscribe_skipped',
        room_uuid,
        active_room_uuid: room_uuid,
        participant_uuid: ctx.staff_participant_uuid,
        user_uuid: ctx.staff_user_uuid,
        role: 'admin',
        tier: ctx.staff_tier,
        source_channel: 'admin',
        channel_name: chat_room_realtime_channel_name(room_uuid),
        cleanup_reason: 'duplicate_subscribe',
        phase: 'admin_chat_realtime_guard',
      })

      return
    }

    const locked_room = room_uuid
    const ctx = admin_rt_ctx_ref.current

    send_chat_realtime_debug({
      event: 'chat_realtime_client_created',
      room_uuid: locked_room,
      active_room_uuid: locked_room,
      participant_uuid: ctx.staff_participant_uuid,
      user_uuid: ctx.staff_user_uuid,
      role: 'admin',
      tier: ctx.staff_tier,
      source_channel: 'admin',
      channel_name: chat_room_realtime_channel_name(locked_room),
      phase: 'admin_chat_create_browser_supabase',
    })

    const channel = subscribe_chat_room_realtime({
      supabase,
      room_uuid: locked_room,
      active_room_uuid: locked_room,
      participant_uuid: ctx.staff_participant_uuid,
      user_uuid: ctx.staff_user_uuid,
      role: 'admin',
      tier: ctx.staff_tier,
      source_channel: 'admin',
      active_typing_identity_ref,
      on_message: (archived) => {
        if (!archived) {
          return
        }

        const mapped = archived_message_to_timeline_message({
          archive_uuid: archived.archive_uuid,
          room_uuid: archived.room_uuid,
          sequence: archived.sequence,
          created_at: archived.created_at,
          bundle: archived.bundle,
        })

        const near_bottom_before = compute_message_list_near_bottom(
          message_list_scroll_ref.current,
        )

        send_chat_realtime_debug({
          event: 'admin_message_state_append_started',
          room_uuid: locked_room,
          active_room_uuid: locked_room,
          participant_uuid: admin_rt_ctx_ref.current.staff_participant_uuid,
          user_uuid: admin_rt_ctx_ref.current.staff_user_uuid,
          role: 'admin',
          tier: admin_rt_ctx_ref.current.staff_tier,
          source_channel: 'admin',
          channel_name: chat_room_realtime_channel_name(locked_room),
          message_uuid: mapped.message_uuid,
          payload_room_uuid: mapped.room_uuid,
          message_direction: mapped.direction,
          message_channel: null,
          message_source_channel: null,
          phase: 'admin_chat_message_append',
        })

        let update_result = {
          prev_message_count: 0,
          next_message_count: 0,
          dedupe_hit: false,
        }

        let append_error: string | null = null

        set_rows_ref.current((previous) => {
          try {
            const result = merge_timeline_rows(previous, [mapped])
            update_result = {
              prev_message_count: result.prev_message_count,
              next_message_count: result.next_message_count,
              dedupe_hit: result.dedupe_hit,
            }

            return result.rows
          } catch (error) {
            append_error =
              error instanceof Error ? error.message : String(error)
            update_result = {
              prev_message_count: previous.length,
              next_message_count: previous.length,
              dedupe_hit: false,
            }

            return previous
          }
        })

        if (append_error) {
          const dbg = admin_rt_ctx_ref.current

          send_chat_realtime_debug({
            event: 'admin_message_state_append_failed',
            room_uuid: locked_room,
            active_room_uuid: locked_room,
            participant_uuid: dbg.staff_participant_uuid,
            user_uuid: dbg.staff_user_uuid,
            role: 'admin',
            tier: dbg.staff_tier,
            source_channel: 'admin',
            channel_name: chat_room_realtime_channel_name(locked_room),
            message_uuid: mapped.message_uuid,
            payload_room_uuid: mapped.room_uuid,
            message_direction: mapped.direction,
            error_message: append_error,
            prev_message_count: update_result.prev_message_count,
            next_message_count: update_result.next_message_count,
            phase: 'admin_chat_message_append',
          })

          return
        }

        if (update_result.dedupe_hit) {
          const dbg = admin_rt_ctx_ref.current

          send_chat_realtime_debug({
            event: 'admin_realtime_payload_ignored',
            room_uuid: locked_room,
            active_room_uuid: locked_room,
            participant_uuid: dbg.staff_participant_uuid,
            user_uuid: dbg.staff_user_uuid,
            role: 'admin',
            tier: dbg.staff_tier,
            source_channel: 'admin',
            channel_name: chat_room_realtime_channel_name(locked_room),
            message_uuid: mapped.message_uuid,
            payload_room_uuid: mapped.room_uuid,
            message_direction: mapped.direction,
            ignored_reason: 'message_uuid_dedupe',
            prev_message_count: update_result.prev_message_count,
            next_message_count: update_result.next_message_count,
            dedupe_hit: true,
            phase: 'admin_chat_message_append',
          })

          return
        }

        send_chat_realtime_debug({
          event: 'admin_message_state_append_succeeded',
          room_uuid: locked_room,
          active_room_uuid: locked_room,
          participant_uuid: admin_rt_ctx_ref.current.staff_participant_uuid,
          user_uuid: admin_rt_ctx_ref.current.staff_user_uuid,
          role: 'admin',
          tier: admin_rt_ctx_ref.current.staff_tier,
          source_channel: 'admin',
          channel_name: chat_room_realtime_channel_name(locked_room),
          message_uuid: mapped.message_uuid,
          payload_room_uuid: mapped.room_uuid,
          message_direction: mapped.direction,
          prev_message_count: update_result.prev_message_count,
          next_message_count: update_result.next_message_count,
          phase: 'admin_chat_message_append',
        })

        const dbg = admin_rt_ctx_ref.current

        handle_chat_message_toast({
          room_uuid: archived.room_uuid,
          active_room_uuid: locked_room,
          message_uuid: archived.archive_uuid,
          sender_user_uuid: archived.sender_user_uuid ?? null,
          sender_participant_uuid: archived.sender_participant_uuid ?? null,
          sender_role: archived.sender_role ?? archived.bundle.sender ?? null,
          active_user_uuid: dbg.staff_user_uuid,
          active_participant_uuid: dbg.staff_participant_uuid,
          active_role: 'admin',
          role: 'admin',
          tier: dbg.staff_tier,
          source_channel: 'admin',
          target_path: `/admin/reception/${archived.room_uuid}`,
          phase: 'admin_chat_detail_realtime_message',
          is_scrolled_to_bottom: near_bottom_before,
          subtitle: resolve_realtime_message_subtitle_for_toast(
            archived,
            room_display_title,
          ),
          scroll_to_bottom: () => {
            bottom_ref.current?.scrollIntoView({
              block: 'end',
              behavior: 'smooth',
            })
          },
        })

        send_chat_realtime_debug({
          event: 'chat_realtime_message_state_updated',
          room_uuid: locked_room,
          active_room_uuid: locked_room,
          participant_uuid: dbg.staff_participant_uuid,
          user_uuid: dbg.staff_user_uuid,
          role: 'admin',
          tier: dbg.staff_tier,
          source_channel: 'admin',
          channel_name: chat_room_realtime_channel_name(locked_room),
          event_name: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_uuid=eq.${locked_room}`,
          payload_room_uuid: archived.room_uuid,
          payload_message_uuid: archived.archive_uuid,
          prev_message_count: update_result.prev_message_count,
          next_message_count: update_result.next_message_count,
          dedupe_hit: update_result.dedupe_hit,
          ignored_reason: update_result.dedupe_hit
            ? 'message_uuid_dedupe'
            : null,
          phase: 'admin_chat_realtime_state_update',
        })
      },
      on_typing: (typing) => {
        typing_rows_ref.current.set(typing.participant_uuid, typing)
        refresh_typing_lines()
        schedule_typing_refresh()

        const dbg = admin_rt_ctx_ref.current

        send_chat_realtime_debug({
          event: 'chat_typing_state_updated',
          room_uuid: locked_room,
          active_room_uuid: locked_room,
          participant_uuid: dbg.staff_participant_uuid,
          user_uuid: dbg.staff_user_uuid,
          role: 'admin',
          tier: dbg.staff_tier,
          source_channel: 'admin',
          channel_name: chat_room_realtime_channel_name(locked_room),
          event_name: 'typing',
          payload_room_uuid: typing.room_uuid,
          sender_user_uuid: typing.user_uuid ?? null,
          sender_participant_uuid: typing.participant_uuid,
          active_participant_uuid: dbg.staff_participant_uuid,
          sender_role: typing.role,
          display_name: typing.display_name ?? null,
          is_typing: typing.is_typing,
          phase: 'admin_chat_typing_state_update',
        })
      },
    })

    subscribed_room_uuid_ref.current = locked_room
    realtime_channel_ref.current = channel

    return () => {
      const cleanup_reason =
        latest_room_uuid_ref.current !== locked_room
          ? 'room_uuid_changed'
          : 'unmount'
      const dbg = admin_rt_ctx_ref.current

      cleanup_chat_room_realtime({
        supabase,
        channel,
        room_uuid: locked_room,
        active_room_uuid: locked_room,
        participant_uuid: dbg.staff_participant_uuid,
        user_uuid: dbg.staff_user_uuid,
        role: 'admin',
        tier: dbg.staff_tier,
        source_channel: 'admin',
        cleanup_reason,
      })

      if (subscribed_room_uuid_ref.current === locked_room) {
        subscribed_room_uuid_ref.current = null
      }

      if (realtime_channel_ref.current === channel) {
        realtime_channel_ref.current = null
      }
    }
  }, [room_uuid, room_display_title])

  const post_typing_presence = useCallback(
    (action: 'typing_start' | 'typing_stop') => {
      if (!room_uuid || !staff_participant_uuid) {
        return
      }

      if (action === 'typing_start' && typing_active_ref.current) {
        return
      }

      const channel = realtime_channel_ref.current

      if (!channel) {
        return
      }

      typing_active_ref.current = action === 'typing_start'

      sync_chat_typing_presence({
        room_uuid,
        participant_uuid: staff_participant_uuid,
        is_typing: action === 'typing_start',
      })

      publish_chat_typing({
        channel,
        room_uuid,
        active_room_uuid: room_uuid,
        participant_uuid: staff_participant_uuid,
        user_uuid: staff_user_uuid,
        role: 'admin',
        tier: staff_tier,
        display_name: staff_display_name,
        is_typing: action === 'typing_start',
        source_channel: 'admin',
      })
    },
    [room_uuid, staff_display_name, staff_participant_uuid, staff_tier, staff_user_uuid],
  )

  useEffect(() => {
    return () => {
      if (typing_timer_ref.current !== null) {
        window.clearTimeout(typing_timer_ref.current)
      }

      if (publish_typing_timer_ref.current !== null) {
        window.clearTimeout(publish_typing_timer_ref.current)
      }

      post_typing_presence('typing_stop')
    }
  }, [post_typing_presence])

  function schedule_publish_typing_stop() {
    if (publish_typing_timer_ref.current !== null) {
      window.clearTimeout(publish_typing_timer_ref.current)
    }

    publish_typing_timer_ref.current = window.setTimeout(() => {
      publish_typing_timer_ref.current = null
      post_typing_presence('typing_stop')
    }, 3_000)
  }

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

      set_rows((previous) => merge_timeline_rows(previous, mapped).rows)
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
        ref={message_list_scroll_ref}
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
          </ol>
        )}
        {typing_lines.length > 0 ? (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-[12px] font-medium text-neutral-600">
            {typing_lines.join(' / ')}
          </div>
        ) : null}
        <div ref={bottom_ref} className="h-1" aria-hidden="true" />
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
                schedule_publish_typing_stop()
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
