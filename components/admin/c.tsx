'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'

import PawIcon from '@/components/icons/paw'
import { send_admin_chat_debug } from '@/lib/admin/chat_debug_client'
import {
  archived_message_to_timeline_message,
  chat_timeline_time_bounds,
  merge_timeline_message_rows,
  timeline_render_key,
  type chat_room_timeline_message,
  type timeline_item_duplicate_skip,
} from '@/lib/chat/timeline_display'
import type { message_bundle } from '@/lib/chat/message'
import { send_room_typing_status } from '@/lib/chat/realtime/typing_client'
import type { locale_key } from '@/lib/locale/action'
import { get_locale, subscribe_locale } from '@/lib/locale/state'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import { use_message_realtime } from '@/lib/chat/realtime/use_message_realtime'
import { use_typing_realtime } from '@/lib/chat/realtime/use_typing_realtime'
import { compute_message_list_near_bottom } from '@/lib/chat/realtime/toast_decision'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { RefObject } from 'react'

const component_file = 'components/admin/c.tsx'

type AdminChatTimelineProps = {
  messages: chat_room_timeline_message[]
  load_failed: boolean
  room_uuid: string
  staff_participant_uuid: string
  staff_display_name: string
  staff_user_uuid: string | null
  staff_tier: string | null
  room_display_title: string
  admin_user_uuid: string
  admin_participant_uuid: string
  realtime_messages_channel_ref?: RefObject<RealtimeChannel | null>
  on_append_timeline_messages?: (messages: chat_room_timeline_message[]) => {
    prev_count: number
    next_count: number
    dedupe_hit: boolean
  }
  peer_typing_label?: string | null
  disable_message_realtime?: boolean
}

function emit_timeline_duplicate_skips(skips: timeline_item_duplicate_skip[]) {
  for (const skip of skips) {
    send_admin_chat_debug({
      event: 'timeline_item_duplicate_skipped',
      room_uuid: skip.room_uuid,
      active_room_uuid: skip.room_uuid,
      action_uuid: skip.kind === 'action' ? skip.uuid : null,
      message_uuid: skip.kind === 'message' ? skip.uuid : null,
      item_key: skip.item_key,
      event_type: skip.kind,
      reason: skip.source,
      component_file,
      phase: 'merge_timeline_items',
    })
  }
}

function merge_timeline_rows(
  previous: chat_room_timeline_message[],
  addition: chat_room_timeline_message[],
  source: 'initial_fetch' | 'realtime' = 'realtime',
): {
  rows: chat_room_timeline_message[]
  prev_message_count: number
  next_message_count: number
  dedupe_hit: boolean
  combined_len_before_normalize: number
  oldest_created_at: string | null
  newest_created_at: string | null
} {
  const combined_len_before_normalize = previous.length + addition.length
  const merged = merge_timeline_message_rows(previous, addition, source)

  emit_timeline_duplicate_skips(merged.duplicates_skipped)

  const bounds = chat_timeline_time_bounds(merged.rows)

  return {
    rows: merged.rows,
    prev_message_count: previous.length,
    next_message_count: merged.rows.length,
    dedupe_hit: merged.duplicates_skipped.length > 0,
    combined_len_before_normalize,
    oldest_created_at: bounds.oldest_created_at,
    newest_created_at: bounds.newest_created_at,
  }
}

function is_outgoing_message(message: chat_room_timeline_message): boolean {
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
}): chat_room_timeline_message {
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
  admin_participant_uuid,
  realtime_messages_channel_ref: parent_messages_channel_ref,
  on_append_timeline_messages,
  peer_typing_label = null,
  disable_message_realtime = false,
}: AdminChatTimelineProps) {
  const bottom_ref = useRef<HTMLDivElement | null>(null)
  const message_list_scroll_ref = useRef<HTMLDivElement | null>(null)
  const local_messages_channel_ref = useRef<RealtimeChannel | null>(null)
  const messages_channel_ref =
    parent_messages_channel_ref ?? local_messages_channel_ref
  const [rows, set_rows] = useState<chat_room_timeline_message[]>(() =>
    merge_timeline_message_rows([], initial_messages, 'initial_fetch').rows,
  )
  const [reply_text, set_reply_text] = useState('')
  const [is_sending, set_is_sending] = useState(false)
  const [show_jump_button, set_show_jump_button] = useState(false)
  const [local_peer_typing_label, set_local_peer_typing_label] =
    useState<string | null>(null)
  const [ui_locale, set_ui_locale] = useState<locale_key>('ja')
  const publish_typing_timer_ref = useRef<number | null>(null)
  const typing_active_ref = useRef(false)
  const display_peer_typing_label =
    local_peer_typing_label ?? peer_typing_label
  const typing_participant_uuid =
    admin_participant_uuid.trim() || staff_participant_uuid.trim()
  const active_typing_identity_ref = useRef({
    user_uuid: staff_user_uuid,
    participant_uuid: typing_participant_uuid,
    role: 'concierge',
  })

  const staff_participant_uuid_ref = useRef(staff_participant_uuid)

  const latest_room_uuid_ref = useRef(room_uuid)

  const admin_rt_ctx_ref = useRef({
    staff_participant_uuid,
    staff_user_uuid,
    staff_tier,
  })

  const show_jump_button_ref = useRef(false)
  const room_display_title_ref = useRef(room_display_title)

  useEffect(() => {
    room_display_title_ref.current = room_display_title
  }, [room_display_title])

  useEffect(() => {
    set_ui_locale(get_locale())

    return subscribe_locale(set_ui_locale)
  }, [])

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
      participant_uuid: typing_participant_uuid,
      role: 'concierge',
    }
  }, [
    room_uuid,
    staff_participant_uuid,
    staff_tier,
    staff_user_uuid,
    typing_participant_uuid,
  ])

  const synced_room_uuid_ref = useRef<string | null>(null)

  useEffect(() => {
    if (synced_room_uuid_ref.current !== room_uuid) {
      synced_room_uuid_ref.current = room_uuid
      set_rows(
        merge_timeline_message_rows([], initial_messages, 'initial_fetch').rows,
      )
      return
    }

    set_rows((previous) =>
      merge_timeline_message_rows(previous, initial_messages, 'initial_fetch')
        .rows,
    )
  }, [initial_messages, room_uuid])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      bottom_ref.current?.scrollIntoView({ block: 'end' })
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [rows.length, room_uuid])

  const bubble_realtime_enabled =
    Boolean(room_uuid.trim()) && !disable_message_realtime

  const handle_realtime_message = useCallback(
    (archived: realtime_archived_message) => {
      const mapped = archived_payload_to_reception_message({
        archive_uuid: archived.archive_uuid,
        room_uuid: archived.room_uuid,
        sequence: archived.sequence,
        created_at: archived.created_at,
        bundle: archived.bundle as message_bundle_payload,
      })

      let update_result = {
        prev_count: 0,
        next_count: 0,
        dedupe_hit: false,
      }

      set_rows((previous) => {
        const merged = merge_timeline_rows(previous, [mapped], 'realtime')

        update_result = {
          prev_count: merged.prev_message_count,
          next_count: merged.next_message_count,
          dedupe_hit: merged.dedupe_hit,
        }

        return merged.rows
      })

      if (on_append_timeline_messages) {
        const appended = on_append_timeline_messages([mapped])

        update_result = {
          prev_count: appended.prev_count,
          next_count: appended.next_count,
          dedupe_hit: appended.dedupe_hit,
        }
      }

      return update_result
    },
    [on_append_timeline_messages],
  )

  const {
    handle_typing: handle_realtime_typing,
    handle_presence: handle_realtime_presence,
    clear_peer_participant: clear_peer_typing_on_message,
  } = use_typing_realtime({
    owner: 'admin',
    room_uuid,
    active_room_uuid: room_uuid,
    enabled: bubble_realtime_enabled,
    participant_uuid: typing_participant_uuid,
    user_uuid: staff_user_uuid,
    role: 'concierge',
    tier: staff_tier,
    source_channel: 'web',
    channel_subscribe: 'shared',
    locale: ui_locale,
    active_typing_identity_ref,
    on_label_change: set_local_peer_typing_label,
  })

  use_message_realtime({
    owner: 'admin',
    room_uuid,
    active_room_uuid: room_uuid,
    enabled: bubble_realtime_enabled,
    participant_uuid: staff_participant_uuid,
    user_uuid: staff_user_uuid,
    role: 'admin',
    tier: staff_tier,
    source_channel: 'admin',
    include_typing_broadcast: true,
    active_typing_identity_ref,
    export_messages_channel_ref: messages_channel_ref,
    on_message: (archived) => {
      const sender_participant_uuid = archived.sender_participant_uuid?.trim()

      if (sender_participant_uuid) {
        clear_peer_typing_on_message(sender_participant_uuid)
      }

      return handle_realtime_message(archived)
    },
    on_typing: handle_realtime_typing,
    on_presence: handle_realtime_presence,
  })

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      bottom_ref.current?.scrollIntoView({ block: 'end' })
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [display_peer_typing_label, rows.length])

  const update_jump_button_visibility = useCallback((visible: boolean) => {
    if (show_jump_button_ref.current === visible) {
      return
    }

    show_jump_button_ref.current = visible
    set_show_jump_button(visible)
  }, [room_uuid])

  const handle_message_scroll = useCallback(() => {
    const near_bottom = compute_message_list_near_bottom(
      message_list_scroll_ref.current,
    )

    update_jump_button_visibility(!near_bottom)
  }, [update_jump_button_visibility])

  const post_typing_presence = useCallback(
    (action: 'typing_start' | 'typing_stop') => {
      if (!room_uuid || !typing_participant_uuid) {
        return
      }

      if (action === 'typing_stop' && !typing_active_ref.current) {
        return
      }

      const is_heartbeat = action === 'typing_start' && typing_active_ref.current

      if (action === 'typing_start') {
        typing_active_ref.current = true
      } else {
        typing_active_ref.current = false
      }

      send_room_typing_status({
        room_uuid,
        active_room_uuid: room_uuid,
        participant_uuid: typing_participant_uuid,
        user_uuid: staff_user_uuid,
        role: 'concierge',
        tier: staff_tier,
        display_name: staff_display_name,
        is_typing: action === 'typing_start',
        source_channel: 'web',
        channel: messages_channel_ref.current,
        typing_phase:
          action === 'typing_start'
            ? is_heartbeat
              ? 'heartbeat'
              : 'start'
            : undefined,
      })
    },
    [
      room_uuid,
      typing_participant_uuid,
      staff_display_name,
      staff_tier,
      staff_user_uuid,
    ],
  )

  useEffect(() => {
    return () => {
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
    }, 5_000)
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

      if (on_append_timeline_messages) {
        on_append_timeline_messages(mapped)
      } else {
        set_rows(
          (previous) => merge_timeline_rows(previous, mapped, 'realtime').rows,
        )
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
      <div className="relative min-h-0 w-full flex-1">
        <div
          ref={message_list_scroll_ref}
          onScroll={handle_message_scroll}
          className="h-full min-h-0 w-full overflow-y-auto overscroll-contain px-6 pb-24 pt-3"
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
                    key={timeline_render_key(message)}
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
                  key={timeline_render_key(message)}
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
        {display_peer_typing_label ? (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-[12px] font-medium text-neutral-600">
            {display_peer_typing_label}
          </div>
        ) : null}
          <div ref={bottom_ref} className="h-1" aria-hidden="true" />
        </div>
        {show_jump_button ? (
          <button
            type="button"
            aria-label="最新メッセージへ移動"
            onClick={() => {
              bottom_ref.current?.scrollIntoView({
                block: 'end',
                behavior: 'smooth',
              })
              update_jump_button_visibility(false)
            }}
            className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-[18px] font-semibold leading-none text-neutral-700 shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <ArrowDown className="h-5 w-5" strokeWidth={2} />
          </button>
        ) : null}
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
            onBlur={() => {
              post_typing_presence('typing_stop')
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
