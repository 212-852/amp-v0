'use client'

import { useCallback, useRef, type MutableRefObject } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { use_session_profile } from '@/components/session/profile'
import type { archived_message } from '@/lib/chat/archive'
import { end_user_should_see_room_action_log_bundle } from '@/lib/chat/rules'
import type { chat_locale } from '@/lib/chat/message'
import { use_message_realtime } from '@/lib/chat/realtime/use_message_realtime'
import type { realtime_archived_message } from '@/lib/chat/realtime/row'
import { use_typing_realtime } from '@/lib/chat/realtime/use_typing_realtime'
import { normalize_locale, type locale_key } from '@/lib/locale/action'

type user_chat_realtime_bridge_props = {
  room_uuid: string
  participant_uuid: string
  locale: chat_locale
  room_realtime_channel_ref: MutableRefObject<RealtimeChannel | null>
  append_realtime_message: (message: archived_message) => {
    prev_message_count: number
    next_message_count: number
    dedupe_hit: boolean
  }
  on_staff_typing_label_change: (label: string | null) => void
}

export function UserChatRealtimeBridge(props: user_chat_realtime_bridge_props) {
  const { session } = use_session_profile()
  const room_uuid = props.room_uuid.trim()
  const participant_uuid = props.participant_uuid.trim()
  const enabled = Boolean(room_uuid && participant_uuid)
  const ui_locale: locale_key = normalize_locale(props.locale)

  const append_ref = useRef(props.append_realtime_message)
  append_ref.current = props.append_realtime_message

  const active_typing_identity_ref = useRef({
    user_uuid: null as string | null,
    participant_uuid: null as string | null,
    role: null as string | null,
  })

  active_typing_identity_ref.current = {
    user_uuid: session?.user_uuid ?? null,
    participant_uuid,
    role: 'user',
  }

  const {
    handle_typing: handle_realtime_typing,
    handle_presence: handle_realtime_presence,
    clear_peer_participant: clear_peer_typing_on_message,
  } = use_typing_realtime({
    owner: 'user',
    room_uuid,
    active_room_uuid: room_uuid,
    enabled,
    participant_uuid,
    user_uuid: session?.user_uuid ?? null,
    role: 'user',
    tier: session?.tier ?? null,
    source_channel: session?.source_channel ?? 'web',
    channel_subscribe: 'shared',
    locale: ui_locale,
    active_typing_identity_ref,
    on_label_change: props.on_staff_typing_label_change,
  })

  const handle_realtime_message = useCallback(
    (message: realtime_archived_message) => {
      if (
        message.bundle.bundle_type === 'room_action_log' &&
        !end_user_should_see_room_action_log_bundle(message.bundle)
      ) {
        return {
          prev_count: 0,
          next_count: 0,
          dedupe_hit: true,
        }
      }

      const sender_participant_uuid = message.sender_participant_uuid?.trim()

      if (sender_participant_uuid) {
        clear_peer_typing_on_message(sender_participant_uuid)
      }

      const update_result = append_ref.current(message)

      return {
        prev_count: update_result.prev_message_count,
        next_count: update_result.next_message_count,
        dedupe_hit: update_result.dedupe_hit,
      }
    },
    [clear_peer_typing_on_message],
  )

  use_message_realtime({
    owner: 'user',
    room_uuid,
    active_room_uuid: room_uuid,
    enabled,
    participant_uuid,
    user_uuid: session?.user_uuid ?? null,
    role: 'user',
    tier: session?.tier ?? null,
    source_channel: session?.source_channel ?? 'web',
    include_typing_broadcast: true,
    active_typing_identity_ref,
    export_messages_channel_ref: props.room_realtime_channel_ref,
    on_message: handle_realtime_message,
    on_typing: handle_realtime_typing,
    on_presence: handle_realtime_presence,
  })

  return null
}
