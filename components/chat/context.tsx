'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { RealtimeChannel } from '@supabase/supabase-js'

import type { archived_message } from '@/lib/chat/archive'
import {
  archived_messages_time_bounds,
  normalize_archived_messages,
} from '@/lib/chat/messages_normalize'
import { create_browser_supabase } from '@/lib/db/browser'
import {
  chat_room_realtime_channel_name,
  send_chat_realtime_debug,
} from '@/lib/chat/realtime/client'
import { resolve_realtime_message_channels } from '@/lib/chat/realtime/messages_client'
import {
  archived_message_from_message_row,
  type message_insert_row,
} from '@/lib/chat/realtime/row'
import { compute_message_list_near_bottom } from '@/lib/chat/realtime/toast_decision'
import type { chat_locale } from '@/lib/chat/message'
import type { room_mode } from '@/lib/chat/room'

import { UserStaffTypingBridge } from '@/components/chat/user_staff_typing_bridge'

type chat_room_client_state = {
  room_uuid: string | null
  participant_uuid: string | null
  locale: chat_locale
  mode: room_mode
}

const user_chat_merge_debug_source_channel = 'user_chat_context'
const user_message_realtime_component = 'components/chat/context.tsx'

function emit_user_message_realtime_debug(
  event: string,
  payload: {
    room_uuid?: string | null
    active_room_uuid?: string | null
    message_uuid?: string | null
    source_channel?: string | null
    direction?: string | null
    subscribe_status?: string | null
    error_message?: string | null
    ignored_reason?: string | null
    prev_count?: number | null
    next_count?: number | null
  },
) {
  send_chat_realtime_debug({
    category: 'chat_realtime',
    event,
    owner: 'user',
    room_uuid: payload.room_uuid ?? null,
    active_room_uuid: payload.active_room_uuid ?? payload.room_uuid ?? null,
    message_uuid: payload.message_uuid ?? null,
    source_channel: payload.source_channel ?? null,
    direction: payload.direction ?? null,
    subscribe_status: payload.subscribe_status ?? null,
    error_message: payload.error_message ?? null,
    ignored_reason: payload.ignored_reason ?? null,
    prev_count: payload.prev_count ?? null,
    next_count: payload.next_count ?? null,
    phase: user_message_realtime_component,
  })
}

type chat_context_value = chat_room_client_state & {
  messages: archived_message[]
  staff_typing_label: string | null
  is_chat_open: boolean
  hydrate_chat: (input: {
    room_uuid: string
    participant_uuid: string
    locale: chat_locale
    mode: room_mode
    messages: archived_message[]
  }) => void
  append_message: (message: archived_message) => void
  append_messages: (messages: archived_message[]) => void
  replace_message: (
    archive_uuid: string,
    message: archived_message,
  ) => void
  remove_message: (archive_uuid: string) => void
  set_mode: (mode: room_mode) => void
  set_chat_open: (open: boolean) => void
  set_staff_typing_label: (label: string | null) => void
  open_chat: () => void
  close_chat: () => void
  set_scroll_container: (node: HTMLDivElement | null) => void
  scroll_to_bottom: (behavior?: ScrollBehavior) => void
  get_message_list_near_bottom: (threshold_px?: number) => boolean
  append_realtime_message: (message: archived_message) => {
    prev_message_count: number
    next_message_count: number
    dedupe_hit: boolean
  }
  /** Same channel as `WebChat` postgres_changes + typing broadcast (do not subscribe again). */
  room_realtime_channel_ref: React.MutableRefObject<RealtimeChannel | null>
}

const UserChatContext = createContext<chat_context_value | null>(null)

export function UserChatProvider({
  children,
}: {
  children: ReactNode
}) {
  const scroll_area_ref = useRef<HTMLDivElement | null>(null)
  const room_realtime_channel_ref = useRef<RealtimeChannel | null>(null)
  const [room_state, set_room_state] =
    useState<chat_room_client_state>({
      room_uuid: null,
      participant_uuid: null,
      locale: 'ja',
      mode: 'bot',
    })
  const [messages, set_messages] = useState<archived_message[]>([])
  const [staff_typing_label, set_staff_typing_label] = useState<string | null>(
    null,
  )
  const [is_chat_open, set_is_chat_open] = useState(false)

  const scroll_to_bottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const el = scroll_area_ref.current

      if (!el || typeof window === 'undefined') {
        return
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight

          if (behavior === 'smooth') {
            el.scrollTo({
              top: el.scrollHeight,
              behavior: 'smooth',
            })
          }
        })
      })
    },
    [],
  )

  const hydrate_chat = useCallback(
    (input: {
      room_uuid: string
      participant_uuid: string
      locale: chat_locale
      mode: room_mode
      messages: archived_message[]
    }) => {
      set_room_state({
        room_uuid: input.room_uuid,
        participant_uuid: input.participant_uuid,
        locale: input.locale,
        mode: input.mode,
      })
      set_messages(normalize_archived_messages(input.messages))
      set_staff_typing_label(null)
      window.setTimeout(() => scroll_to_bottom('auto'), 0)
    },
    [scroll_to_bottom],
  )

  const append_message = useCallback((message: archived_message) => {
    set_messages((current) =>
      normalize_archived_messages([...current, message]),
    )
    window.setTimeout(() => scroll_to_bottom('smooth'), 0)
  }, [scroll_to_bottom])

  const append_realtime_message = useCallback(
    (message: archived_message) => {
      let result = {
        prev_message_count: 0,
        next_message_count: 0,
        dedupe_hit: false,
      }

      set_messages((current) => {
        const dedupe_hit = current.some(
          (item) => item.archive_uuid === message.archive_uuid,
        )

        if (dedupe_hit) {
          result = {
            prev_message_count: current.length,
            next_message_count: current.length,
            dedupe_hit: true,
          }

          return current
        }

        const room_uuid = room_state.room_uuid
        const participant_uuid = room_state.participant_uuid
        const before_len = current.length + 1
        const ch =
          room_uuid !== null ? chat_room_realtime_channel_name(room_uuid) : null

        if (room_uuid && ch) {
          send_chat_realtime_debug({
            event: 'realtime_message_merge_started',
            room_uuid,
            active_room_uuid: room_uuid,
            participant_uuid,
            user_uuid: null,
            role: 'user',
            tier: null,
            source_channel: user_chat_merge_debug_source_channel,
            channel_name: ch,
            phase: 'user_chat_timeline_merge',
            message_count_before: current.length,
            message_count_after: null,
            oldest_created_at: null,
            newest_created_at: null,
            realtime_message_uuid: message.archive_uuid,
            realtime_created_at: message.created_at,
          })

          send_chat_realtime_debug({
            event: 'chat_messages_normalize_started',
            room_uuid,
            active_room_uuid: room_uuid,
            participant_uuid,
            user_uuid: null,
            role: 'user',
            tier: null,
            source_channel: user_chat_merge_debug_source_channel,
            channel_name: ch,
            phase: 'user_chat_timeline_merge',
            message_count_before: before_len,
            message_count_after: null,
            oldest_created_at: null,
            newest_created_at: null,
            realtime_message_uuid: message.archive_uuid,
            realtime_created_at: message.created_at,
          })
        }

        const next = normalize_archived_messages([...current, message])
        const bounds = archived_messages_time_bounds(next)

        if (room_uuid && ch) {
          send_chat_realtime_debug({
            event: 'chat_messages_sorted',
            room_uuid,
            active_room_uuid: room_uuid,
            participant_uuid,
            user_uuid: null,
            role: 'user',
            tier: null,
            source_channel: user_chat_merge_debug_source_channel,
            channel_name: ch,
            phase: 'user_chat_timeline_merge',
            message_count_before: before_len,
            message_count_after: next.length,
            oldest_created_at: bounds.oldest_created_at,
            newest_created_at: bounds.newest_created_at,
            realtime_message_uuid: message.archive_uuid,
            realtime_created_at: message.created_at,
          })

          send_chat_realtime_debug({
            event: 'realtime_message_merge_succeeded',
            room_uuid,
            active_room_uuid: room_uuid,
            participant_uuid,
            user_uuid: null,
            role: 'user',
            tier: null,
            source_channel: user_chat_merge_debug_source_channel,
            channel_name: ch,
            phase: 'user_chat_timeline_merge',
            message_count_before: before_len,
            message_count_after: next.length,
            oldest_created_at: bounds.oldest_created_at,
            newest_created_at: bounds.newest_created_at,
            realtime_message_uuid: message.archive_uuid,
            realtime_created_at: message.created_at,
          })
        }

        result = {
          prev_message_count: current.length,
          next_message_count: next.length,
          dedupe_hit: false,
        }

        return next
      })

      window.setTimeout(() => scroll_to_bottom('smooth'), 0)

      return result
    },
    [room_state.participant_uuid, room_state.room_uuid, scroll_to_bottom],
  )

  const append_messages = useCallback(
    (next_messages: archived_message[]) => {
      set_messages((current) =>
        normalize_archived_messages([...current, ...next_messages]),
      )
      window.setTimeout(() => scroll_to_bottom('smooth'), 0)
    },
    [scroll_to_bottom],
  )

  const replace_message = useCallback(
    (archive_uuid: string, message: archived_message) => {
      set_messages((current) =>
        normalize_archived_messages(
          current.map((item) =>
            item.archive_uuid === archive_uuid ? message : item,
          ),
        ),
      )
      window.setTimeout(() => scroll_to_bottom('smooth'), 0)
    },
    [scroll_to_bottom],
  )

  const remove_message = useCallback((archive_uuid: string) => {
    set_messages((current) =>
      current.filter((item) => item.archive_uuid !== archive_uuid),
    )
  }, [])

  const set_mode = useCallback((mode: room_mode) => {
    set_room_state((current) => ({
      ...current,
      mode,
    }))
  }, [])

  const set_chat_open = useCallback((open: boolean) => {
    set_is_chat_open(open)
  }, [])

  const open_chat = useCallback(() => {
    set_is_chat_open(true)
  }, [])

  const close_chat = useCallback(() => {
    set_is_chat_open(false)
  }, [])

  const set_scroll_container = useCallback(
    (node: HTMLDivElement | null) => {
      scroll_area_ref.current = node
    },
    [],
  )

  const get_message_list_near_bottom = useCallback(
    (threshold_px = 80) => {
      return compute_message_list_near_bottom(
        scroll_area_ref.current,
        threshold_px,
      )
    },
    [],
  )

  useEffect(() => {
    const focus_room_uuid = (room_state.room_uuid ?? '').trim()
    const active_room_uuid = focus_room_uuid

    emit_user_message_realtime_debug('message_realtime_mounted', {
      room_uuid: focus_room_uuid || null,
      active_room_uuid: active_room_uuid || null,
      subscribe_status: 'HOOK_MOUNTED',
    })

    if (!focus_room_uuid) {
      emit_user_message_realtime_debug('message_realtime_subscribe_status', {
        room_uuid: null,
        active_room_uuid: null,
        subscribe_status: 'DEFERRED_NO_ROOM_UUID',
      })

      return
    }

    emit_user_message_realtime_debug('message_realtime_subscribe_started', {
      room_uuid: focus_room_uuid,
      active_room_uuid: focus_room_uuid,
      subscribe_status: 'SUBSCRIBE_REQUESTED',
    })

    const supabase = create_browser_supabase()

    if (!supabase) {
      emit_user_message_realtime_debug('message_realtime_subscribe_status', {
        room_uuid: focus_room_uuid,
        active_room_uuid: focus_room_uuid,
        subscribe_status: 'SUPABASE_CLIENT_UNAVAILABLE',
        error_message: 'create_browser_supabase_returned_null',
      })

      return
    }

    const postgres_filter = `room_uuid=eq.${focus_room_uuid}`
    const channel_name = `message_realtime:user_active:${focus_room_uuid}`

    const channel = supabase
      .channel(channel_name)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: postgres_filter,
        },
        (payload) => {
          const row = payload.new as message_insert_row
          const payload_room_uuid =
            typeof row?.room_uuid === 'string' ? row.room_uuid.trim() : ''
          const message_uuid =
            typeof row?.message_uuid === 'string' ? row.message_uuid : null

          const archived = archived_message_from_message_row(row)

          const channels = archived
            ? resolve_realtime_message_channels(archived)
            : { source_channel: null, direction: null }

          emit_user_message_realtime_debug('message_realtime_payload_received', {
            room_uuid: focus_room_uuid,
            active_room_uuid: focus_room_uuid,
            message_uuid: message_uuid ?? archived?.archive_uuid ?? null,
            source_channel: channels.source_channel,
            direction: channels.direction,
          })

          if (payload_room_uuid && payload_room_uuid !== focus_room_uuid) {
            emit_user_message_realtime_debug('message_realtime_payload_ignored', {
              room_uuid: focus_room_uuid,
              active_room_uuid: focus_room_uuid,
              message_uuid: message_uuid ?? archived?.archive_uuid ?? null,
              source_channel: channels.source_channel,
              direction: channels.direction,
              ignored_reason: 'payload_room_uuid_mismatch',
            })

            return
          }

          if (!archived) {
            emit_user_message_realtime_debug('message_realtime_payload_ignored', {
              room_uuid: focus_room_uuid,
              active_room_uuid: focus_room_uuid,
              message_uuid,
              ignored_reason: 'unparseable_message_row',
            })

            return
          }

          emit_user_message_realtime_debug('message_realtime_payload_accepted', {
            room_uuid: focus_room_uuid,
            active_room_uuid: focus_room_uuid,
            message_uuid: archived.archive_uuid,
            source_channel: channels.source_channel,
            direction: channels.direction,
          })

          let render_result = {
            prev_count: 0,
            next_count: 0,
            dedupe_hit: true,
          }

          set_messages((current) => {
            const dedupe_hit = current.some(
              (item) => item.archive_uuid === archived.archive_uuid,
            )

            if (dedupe_hit) {
              render_result = {
                prev_count: current.length,
                next_count: current.length,
                dedupe_hit: true,
              }

              return current
            }

            const next = normalize_archived_messages([...current, archived])

            render_result = {
              prev_count: current.length,
              next_count: next.length,
              dedupe_hit: false,
            }

            return next
          })

          if (!render_result.dedupe_hit) {
            emit_user_message_realtime_debug('message_realtime_rendered', {
              room_uuid: focus_room_uuid,
              active_room_uuid: focus_room_uuid,
              message_uuid: archived.archive_uuid,
              source_channel: channels.source_channel,
              direction: channels.direction,
              prev_count: render_result.prev_count,
              next_count: render_result.next_count,
            })

            window.setTimeout(() => scroll_to_bottom('smooth'), 0)
          }
        },
      )
      .subscribe((status, err) => {
        emit_user_message_realtime_debug('message_realtime_subscribe_status', {
          room_uuid: focus_room_uuid,
          active_room_uuid: focus_room_uuid,
          subscribe_status: status,
          error_message: err ? String(err) : null,
        })
      })

    room_realtime_channel_ref.current = channel

    return () => {
      emit_user_message_realtime_debug('message_realtime_subscribe_status', {
        room_uuid: focus_room_uuid,
        active_room_uuid: focus_room_uuid,
        subscribe_status: 'CLEANUP',
      })

      void supabase.removeChannel(channel)

      if (room_realtime_channel_ref.current === channel) {
        room_realtime_channel_ref.current = null
      }
    }
  }, [room_state.room_uuid, scroll_to_bottom])

  useEffect(() => {
    if (room_state.mode !== 'concierge') {
      return
    }

    if (typeof window === 'undefined') {
      return
    }

    const open_timer = window.setTimeout(() => {
      set_is_chat_open(true)
    }, 0)

    window.requestAnimationFrame(() => {
      scroll_to_bottom('smooth')
    })

    return () => {
      window.clearTimeout(open_timer)
    }
  }, [room_state.mode, scroll_to_bottom])

  const active_room_uuid = (room_state.room_uuid ?? '').trim()
  const active_participant_uuid = (room_state.participant_uuid ?? '').trim()

  const value = useMemo(
    () => ({
      ...room_state,
      messages,
      staff_typing_label,
      is_chat_open,
      hydrate_chat,
      append_message,
      append_messages,
      append_realtime_message,
      replace_message,
      remove_message,
      set_mode,
      set_chat_open,
      set_staff_typing_label,
      open_chat,
      close_chat,
      set_scroll_container,
      scroll_to_bottom,
      get_message_list_near_bottom,
      room_realtime_channel_ref,
    }),
    [
      room_state,
      messages,
      staff_typing_label,
      is_chat_open,
      hydrate_chat,
      append_message,
      append_messages,
      append_realtime_message,
      replace_message,
      remove_message,
      set_mode,
      set_chat_open,
      open_chat,
      close_chat,
      set_scroll_container,
      scroll_to_bottom,
      get_message_list_near_bottom,
    ],
  )

  return (
    <UserChatContext.Provider value={value}>
      {active_room_uuid && active_participant_uuid ? (
        <UserStaffTypingBridge
          room_uuid={active_room_uuid}
          participant_uuid={active_participant_uuid}
          locale={room_state.locale}
          on_staff_typing_label_change={set_staff_typing_label}
        />
      ) : null}
      {children}
    </UserChatContext.Provider>
  )
}

export function useUserChat() {
  const context = useContext(UserChatContext)

  if (!context) {
    throw new Error('useUserChat must be used inside UserChatProvider')
  }

  return context
}
