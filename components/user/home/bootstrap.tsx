'use client'

import { useEffect, useState } from 'react'

import { WebChat } from '@/components/chat/web'
import type { archived_message } from '@/lib/chat/archive'
import type { chat_locale } from '@/lib/chat/message'
import type { room_mode } from '@/lib/chat/room'
import { build_session_restore_headers } from '@/lib/visitor/client'

type session_response = {
  locale?: chat_locale
  source_channel?: string | null
  chat?: {
    room_uuid?: string | null
    participant_uuid?: string | null
    mode?: room_mode | null
  } | null
  session?: {
    locale?: chat_locale
    source_channel?: string | null
    chat?: {
      room_uuid?: string | null
      participant_uuid?: string | null
      mode?: room_mode | null
    } | null
  } | null
}

type loaded_chat = {
  room_uuid: string
  participant_uuid: string
  locale: chat_locale
  mode: room_mode
  messages: archived_message[]
}

function merge_session(raw: session_response | null) {
  return {
    ...(raw ?? {}),
    ...(raw?.session ?? {}),
  } as session_response
}

export default function UserHomeChatBootstrap() {
  const [chat, set_chat] = useState<loaded_chat | null>(null)
  const [failed, set_failed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const session_response_raw = await fetch('/api/session', {
        method: 'GET',
        credentials: 'include',
        headers: build_session_restore_headers(),
      })
      const raw = (await session_response_raw.json().catch(() => null)) as
        | session_response
        | null
      const session = merge_session(raw)
      const room_uuid = session.chat?.room_uuid ?? null
      const participant_uuid = session.chat?.participant_uuid ?? null

      if (!room_uuid || !participant_uuid) {
        set_failed(true)
        return
      }

      const messages_response = await fetch('/api/chat/room/messages', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          room_uuid,
          participant_uuid,
          source_channel: session.source_channel ?? null,
        }),
      })
      const payload = (await messages_response.json().catch(() => null)) as {
        ok?: boolean
        messages?: archived_message[]
      } | null

      if (cancelled) {
        return
      }

      if (!messages_response.ok || !payload?.ok) {
        set_failed(true)
        return
      }

      set_chat({
        room_uuid,
        participant_uuid,
        locale: session.locale ?? 'ja',
        mode: session.chat?.mode ?? 'bot',
        messages: payload.messages ?? [],
      })
    }

    void load().catch(() => {
      if (!cancelled) {
        set_failed(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (chat) {
    return (
      <WebChat
        messages={chat.messages}
        room_uuid={chat.room_uuid}
        participant_uuid={chat.participant_uuid}
        locale={chat.locale}
        mode={chat.mode}
      />
    )
  }

  if (failed) {
    return (
      <section className="px-5 pt-6">
        <div className="rounded-[20px] bg-white px-5 py-6 text-center shadow-[0_2px_14px_rgba(42,29,24,0.06)]">
          <p className="text-[16px] font-semibold text-[#2a1d18]">
            チャットの読み込みに失敗しました
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex rounded-full bg-[#c9a77d] px-5 py-2 text-[13px] font-semibold text-white"
          >
            再試行
          </button>
        </div>
      </section>
    )
  }

  return null
}

