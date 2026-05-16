'use client'

import {
  chat_typing_expire_ms,
  chat_typing_is_fresh,
  send_chat_realtime_debug,
  type chat_presence_payload,
  type chat_typing_payload,
} from './client'

export type peer_typing_row = {
  participant_uuid: string
  role: string | null
  is_typing: boolean
  sent_at: string | null
  source_channel: string | null
}

export type typing_ui_owner = 'admin' | 'user'

function emit_typing_ui_debug(
  event:
    | 'chat_typing_started'
    | 'chat_typing_stopped'
    | 'chat_typing_realtime_received'
    | 'chat_typing_realtime_rendered'
    | 'chat_typing_expired',
  owner: typing_ui_owner,
  payload: {
    room_uuid: string
    participant_uuid?: string | null
    is_typing?: boolean | null
    ignored_reason?: string | null
    prev_count?: number | null
    next_count?: number | null
  },
) {
  send_chat_realtime_debug({
    category: 'chat_realtime',
    event,
    owner,
    room_uuid: payload.room_uuid,
    active_room_uuid: payload.room_uuid,
    participant_uuid: payload.participant_uuid ?? null,
    is_typing: payload.is_typing ?? null,
    ignored_reason: payload.ignored_reason ?? null,
    prev_count: payload.prev_count ?? null,
    next_count: payload.next_count ?? null,
    phase: 'typing_ui',
  })
}

function line_typing_suppressed(
  source_channel: string | null | undefined,
): boolean {
  return (source_channel ?? '').trim().toLowerCase() === 'line'
}

export function apply_chat_typing_broadcast(
  map: Map<string, peer_typing_row>,
  typing: chat_typing_payload,
): { changed: boolean; prev_count: number; next_count: number } {
  const prev_count = map.size
  const key = typing.participant_uuid

  if (!typing.is_typing) {
    map.delete(key)
    return { changed: true, prev_count, next_count: map.size }
  }

  map.set(key, {
    participant_uuid: typing.participant_uuid,
    role: typing.role,
    is_typing: true,
    sent_at: typing.sent_at,
    source_channel: null,
  })

  return { changed: true, prev_count, next_count: map.size }
}

export function apply_chat_presence_typing(
  map: Map<string, peer_typing_row>,
  presence: chat_presence_payload,
): { changed: boolean; prev_count: number; next_count: number } {
  const prev_count = map.size

  if (line_typing_suppressed(presence.source_channel)) {
    return { changed: false, prev_count, next_count: prev_count }
  }

  const key = presence.participant_uuid

  if (!presence.is_typing) {
    if (!map.has(key)) {
      return { changed: false, prev_count, next_count: prev_count }
    }

    map.delete(key)
    return { changed: true, prev_count, next_count: map.size }
  }

  const sent_at = presence.typing_at ?? presence.last_seen_at ?? new Date().toISOString()

  map.set(key, {
    participant_uuid: presence.participant_uuid,
    role: presence.role,
    is_typing: true,
    sent_at,
    source_channel: presence.source_channel,
  })

  return { changed: true, prev_count, next_count: map.size }
}

export function clear_peer_typing_participant(
  map: Map<string, peer_typing_row>,
  participant_uuid: string,
): { changed: boolean; prev_count: number; next_count: number } {
  const prev_count = map.size

  if (!map.delete(participant_uuid.trim())) {
    return { changed: false, prev_count, next_count: prev_count }
  }

  return { changed: true, prev_count, next_count: map.size }
}

export function sweep_expired_peer_typing(
  map: Map<string, peer_typing_row>,
  now?: Date,
): { changed: boolean; prev_count: number; next_count: number } {
  const prev_count = map.size
  let changed = false

  for (const [key, row] of map.entries()) {
    if (
      !chat_typing_is_fresh({
        is_typing: row.is_typing,
        sent_at: row.sent_at ?? '',
        now,
      })
    ) {
      map.delete(key)
      changed = true
    }
  }

  return { changed, prev_count, next_count: map.size }
}

export function peer_typing_label_for_admin(
  map: Map<string, peer_typing_row>,
  staff_participant_uuid: string,
  now?: Date,
): string | null {
  const staff = staff_participant_uuid.trim()
  let user_typing = false
  let staff_typing = false

  for (const row of map.values()) {
    if (row.participant_uuid === staff) {
      continue
    }

    if (line_typing_suppressed(row.source_channel)) {
      continue
    }

    if (
      !chat_typing_is_fresh({
        is_typing: row.is_typing,
        sent_at: row.sent_at ?? '',
        now,
      })
    ) {
      continue
    }

    const role = row.role?.trim().toLowerCase() ?? ''

    if (role === 'user' || role === 'driver') {
      user_typing = true
    } else if (role === 'admin' || role === 'concierge') {
      staff_typing = true
    }
  }

  if (user_typing) {
    return 'ユーザー入力中...'
  }

  if (staff_typing) {
    return 'スタッフ入力中...'
  }

  return null
}

export function peer_typing_label_for_user(
  map: Map<string, peer_typing_row>,
  self_participant_uuid: string,
  now?: Date,
): string | null {
  const self = self_participant_uuid.trim()

  for (const row of map.values()) {
    if (row.participant_uuid === self) {
      continue
    }

    if (line_typing_suppressed(row.source_channel)) {
      continue
    }

    const role = row.role?.trim().toLowerCase() ?? ''

    if (
      (role === 'admin' || role === 'concierge' || role === 'bot') &&
      chat_typing_is_fresh({
        is_typing: row.is_typing,
        sent_at: row.sent_at ?? '',
        now,
      })
    ) {
      return 'スタッフ入力中...'
    }
  }

  return null
}

export function handle_typing_broadcast_for_ui(input: {
  owner: typing_ui_owner
  room_uuid: string
  map: Map<string, peer_typing_row>
  typing: chat_typing_payload
  self_participant_uuid: string
  on_label_change: (label: string | null) => void
  resolve_label: (
    map: Map<string, peer_typing_row>,
    self_participant_uuid: string,
  ) => string | null
}) {
  const merge = apply_chat_typing_broadcast(input.map, input.typing)

  emit_typing_ui_debug('chat_typing_realtime_received', input.owner, {
    room_uuid: input.room_uuid,
    participant_uuid: input.typing.participant_uuid,
    is_typing: input.typing.is_typing,
    prev_count: merge.prev_count,
    next_count: merge.next_count,
  })

  if (!input.typing.is_typing) {
    emit_typing_ui_debug('chat_typing_stopped', input.owner, {
      room_uuid: input.room_uuid,
      participant_uuid: input.typing.participant_uuid,
      is_typing: false,
      prev_count: merge.prev_count,
      next_count: merge.next_count,
    })
  } else {
    emit_typing_ui_debug('chat_typing_started', input.owner, {
      room_uuid: input.room_uuid,
      participant_uuid: input.typing.participant_uuid,
      is_typing: true,
      prev_count: merge.prev_count,
      next_count: merge.next_count,
    })
  }

  const label = input.resolve_label(input.map, input.self_participant_uuid)

  input.on_label_change(label)

  emit_typing_ui_debug('chat_typing_realtime_rendered', input.owner, {
    room_uuid: input.room_uuid,
    participant_uuid: input.typing.participant_uuid,
    is_typing: input.typing.is_typing,
    prev_count: merge.prev_count,
    next_count: merge.next_count,
  })
}

export function handle_presence_typing_for_ui(input: {
  owner: typing_ui_owner
  room_uuid: string
  map: Map<string, peer_typing_row>
  presence: chat_presence_payload
  self_participant_uuid: string
  on_label_change: (label: string | null) => void
  resolve_label: (
    map: Map<string, peer_typing_row>,
    self_participant_uuid: string,
  ) => string | null
}) {
  if (line_typing_suppressed(input.presence.source_channel)) {
    return
  }

  const merge = apply_chat_presence_typing(input.map, input.presence)

  if (!merge.changed) {
    return
  }

  emit_typing_ui_debug('chat_typing_realtime_received', input.owner, {
    room_uuid: input.room_uuid,
    participant_uuid: input.presence.participant_uuid,
    is_typing: input.presence.is_typing,
    prev_count: merge.prev_count,
    next_count: merge.next_count,
  })

  if (!input.presence.is_typing) {
    emit_typing_ui_debug('chat_typing_stopped', input.owner, {
      room_uuid: input.room_uuid,
      participant_uuid: input.presence.participant_uuid,
      is_typing: false,
      prev_count: merge.prev_count,
      next_count: merge.next_count,
    })
  } else {
    emit_typing_ui_debug('chat_typing_started', input.owner, {
      room_uuid: input.room_uuid,
      participant_uuid: input.presence.participant_uuid,
      is_typing: true,
      prev_count: merge.prev_count,
      next_count: merge.next_count,
    })
  }

  const label = input.resolve_label(input.map, input.self_participant_uuid)

  input.on_label_change(label)

  emit_typing_ui_debug('chat_typing_realtime_rendered', input.owner, {
    room_uuid: input.room_uuid,
    participant_uuid: input.presence.participant_uuid,
    is_typing: input.presence.is_typing,
    prev_count: merge.prev_count,
    next_count: merge.next_count,
  })
}

export function schedule_peer_typing_sweep(input: {
  owner: typing_ui_owner
  room_uuid: string
  map: Map<string, peer_typing_row>
  self_participant_uuid: string
  on_label_change: (label: string | null) => void
  resolve_label: (
    map: Map<string, peer_typing_row>,
    self_participant_uuid: string,
  ) => string | null
}) {
  window.setTimeout(() => {
    const sweep = sweep_expired_peer_typing(input.map)

    if (!sweep.changed) {
      return
    }

    emit_typing_ui_debug('chat_typing_expired', input.owner, {
      room_uuid: input.room_uuid,
      prev_count: sweep.prev_count,
      next_count: sweep.next_count,
    })

    input.on_label_change(
      input.resolve_label(input.map, input.self_participant_uuid),
    )
  }, chat_typing_expire_ms + 100)
}
