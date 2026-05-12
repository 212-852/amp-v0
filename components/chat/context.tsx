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
import type { chat_locale } from '@/lib/chat/message'
import type { room_mode } from '@/lib/chat/room'

type chat_room_client_state = {
  room_uuid: string | null
  participant_uuid: string | null
  locale: chat_locale
  mode: room_mode
}

type chat_context_value = chat_room_client_state & {
  messages: archived_message[]
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
  open_chat: () => void
  close_chat: () => void
  set_scroll_container: (node: HTMLDivElement | null) => void
  scroll_to_bottom: (behavior?: ScrollBehavior) => void
  append_realtime_message: (message: archived_message) => {
    prev_message_count: number
    next_message_count: number
    dedupe_hit: boolean
  }
  /** Same channel as `WebChat` postgres_changes + typing broadcast (do not subscribe again). */
  room_realtime_channel_ref: React.MutableRefObject<RealtimeChannel | null>
}

const UserChatContext = createContext<chat_context_value | null>(null)

function message_key(message: archived_message) {
  return message.bundle.bundle_uuid || message.archive_uuid
}

function append_unique(
  current_messages: archived_message[],
  next_messages: archived_message[],
) {
  const merged = [...current_messages]
  const seen_archive = new Set(
    current_messages.map((message) => message.archive_uuid),
  )

  next_messages.forEach((message) => {
    if (seen_archive.has(message.archive_uuid)) {
      return
    }

    seen_archive.add(message.archive_uuid)
    merged.push(message)
  })

  return merged.sort((a, b) => a.sequence - b.sequence)
}

function unique_messages(messages: archived_message[]) {
  const bundle_keys = new Set<string>()
  const archive_keys = new Set<string>()
  const unique: archived_message[] = []

  messages.forEach((message) => {
    const bundle_key = message_key(message)

    if (archive_keys.has(message.archive_uuid)) {
      return
    }

    if (bundle_keys.has(bundle_key)) {
      return
    }

    bundle_keys.add(bundle_key)
    archive_keys.add(message.archive_uuid)
    unique.push(message)
  })

  return unique.sort((a, b) => a.sequence - b.sequence)
}

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
      set_messages(input.messages)
      window.setTimeout(() => scroll_to_bottom('auto'), 0)
    },
    [scroll_to_bottom],
  )

  const append_message = useCallback((message: archived_message) => {
    set_messages((current) => append_unique(current, [message]))
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
        const next = dedupe_hit
          ? current
          : [...current, message].sort((a, b) => a.sequence - b.sequence)

        result = {
          prev_message_count: current.length,
          next_message_count: next.length,
          dedupe_hit,
        }

        return next
      })

      window.setTimeout(() => scroll_to_bottom('smooth'), 0)

      return result
    },
    [scroll_to_bottom],
  )

  const append_messages = useCallback(
    (next_messages: archived_message[]) => {
      set_messages((current) => append_unique(current, next_messages))
      window.setTimeout(() => scroll_to_bottom('smooth'), 0)
    },
    [scroll_to_bottom],
  )

  const replace_message = useCallback(
    (archive_uuid: string, message: archived_message) => {
      set_messages((current) =>
        unique_messages(
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

  const value = useMemo(
    () => ({
      ...room_state,
      messages,
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
      room_realtime_channel_ref,
    }),
    [
      room_state,
      messages,
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
    ],
  )

  return (
    <UserChatContext.Provider value={value}>
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
