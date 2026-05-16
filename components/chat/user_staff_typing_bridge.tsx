'use client'

import { use_typing_realtime } from '@/lib/chat/realtime/use_typing_realtime'
import { normalize_locale, type locale_key } from '@/lib/locale/action'
import type { chat_locale } from '@/lib/chat/message'

type user_staff_typing_bridge_props = {
  room_uuid: string
  participant_uuid: string
  locale: chat_locale
  on_staff_typing_label_change: (label: string | null) => void
}

export function UserStaffTypingBridge(props: user_staff_typing_bridge_props) {
  const room_uuid = props.room_uuid.trim()
  const participant_uuid = props.participant_uuid.trim()
  const enabled = Boolean(room_uuid && participant_uuid)
  const ui_locale: locale_key = normalize_locale(props.locale)

  use_typing_realtime({
    owner: 'user',
    room_uuid,
    active_room_uuid: room_uuid,
    enabled,
    participant_uuid,
    role: 'user',
    source_channel: 'web',
    channel_subscribe: 'standalone',
    locale: ui_locale,
    on_label_change: props.on_staff_typing_label_change,
  })

  return null
}
