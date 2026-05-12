import 'server-only'

import { batch_resolve_admin_operator_display } from '@/lib/admin/profile'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

import {
  decide_active_participants,
  decide_typing_participants,
  is_participant_role,
  resolve_chat_room_list_preview_text,
  type participant_role,
  type presence_participant,
  type reception_room_card,
  typing_timestamp_is_fresh,
} from './rules'

type participant_row = {
  participant_uuid: string
  room_uuid: string | null
  user_uuid: string | null
  visitor_uuid: string | null
  role: string | null
  is_active: boolean | null
  is_typing: boolean | null
  last_seen_at: string | null
  typing_at: string | null
  last_channel?: string | null
  status?: string | null
}

type profile_row = {
  user_uuid?: string
  visitor_uuid?: string
  display_name: string | null
  image_url?: string | null
}

type room_row = {
  room_uuid: string
  status: string | null
  mode: string | null
  action_id: string | null
  updated_at: string | null
}

type message_row = {
  room_uuid: string
  body: string | null
  created_at: string
}

export type reception_room_card_query = {
  limit: number
  statuses?: string[] | null
  modes?: string[] | null
}

function normalize_role(value: string | null): participant_role {
  return is_participant_role(value) ? value : 'user'
}

function participant_name(input: {
  row: participant_row
  user_profiles: Map<string, profile_row>
  visitor_profiles: Map<string, profile_row>
}) {
  if (input.row.user_uuid) {
    return input.user_profiles.get(input.row.user_uuid)?.display_name ?? null
  }

  if (input.row.visitor_uuid) {
    return (
      input.visitor_profiles.get(input.row.visitor_uuid)?.display_name ?? null
    )
  }

  return null
}

function participant_avatar(input: {
  row: participant_row
  user_profiles: Map<string, profile_row>
}) {
  if (!input.row.user_uuid) {
    return null
  }

  return input.user_profiles.get(input.row.user_uuid)?.image_url ?? null
}

function to_presence_participant(input: {
  row: participant_row
  user_profiles: Map<string, profile_row>
  visitor_profiles: Map<string, profile_row>
}): presence_participant {
  return {
    participant_uuid: input.row.participant_uuid,
    display_name: participant_name(input),
    avatar_url: participant_avatar(input),
    role: normalize_role(input.row.role),
    is_active: input.row.is_active === true,
    is_typing: input.row.is_typing === true,
    last_seen_at: input.row.last_seen_at,
    typing_at: input.row.typing_at,
  }
}

function extract_text_from_message_body(body: string | null): string | null {
  if (!body) {
    return null
  }

  try {
    const parsed = JSON.parse(body) as {
      bundle?: {
        bundle_type?: string
        payload?: { text?: string }
      }
    }
    const bundle = parsed?.bundle

    if (!bundle) {
      return null
    }

    if (
      bundle.bundle_type === 'text' &&
      typeof bundle.payload?.text === 'string'
    ) {
      return bundle.payload.text
    }

    return bundle.bundle_type ? `[${bundle.bundle_type}]` : null
  } catch {
    return null
  }
}

async function update_participant_presence(input: {
  room_uuid: string
  participant_uuid: string
  patch: Record<string, unknown>
}) {
  const result = await supabase
    .from('participants')
    .update(input.patch)
    .eq('room_uuid', input.room_uuid)
    .eq('participant_uuid', input.participant_uuid)

  if (result.error) {
    throw result.error
  }
}

export async function mark_room_entered(input: {
  room_uuid: string
  participant_uuid: string
}) {
  await update_participant_presence({
    ...input,
    patch: {
      is_active: true,
      last_seen_at: new Date().toISOString(),
    },
  })
}

export async function mark_room_left(input: {
  room_uuid: string
  participant_uuid: string
}) {
  await update_participant_presence({
    ...input,
    patch: {
      is_active: false,
      is_typing: false,
      last_seen_at: new Date().toISOString(),
    },
  })
}

export async function mark_typing_started(input: {
  room_uuid: string
  participant_uuid: string
}) {
  await update_participant_presence({
    ...input,
    patch: {
      is_typing: true,
      typing_at: new Date().toISOString(),
    },
  })
}

export async function mark_typing_stopped(input: {
  room_uuid: string
  participant_uuid: string
}) {
  await update_participant_presence({
    ...input,
    patch: {
      is_typing: false,
      typing_at: null,
    },
  })
}

async function load_profiles(participants: participant_row[]) {
  const user_uuids = Array.from(
    new Set(
      participants
        .map((row) => row.user_uuid)
        .filter((value): value is string => Boolean(value)),
    ),
  )
  const visitor_uuids = Array.from(
    new Set(
      participants
        .map((row) => row.visitor_uuid)
        .filter((value): value is string => Boolean(value)),
    ),
  )
  const user_profiles = new Map<string, profile_row>()
  const visitor_profiles = new Map<string, profile_row>()

  if (user_uuids.length > 0) {
    const users_result = await supabase
      .from('users')
      .select('user_uuid, display_name, image_url')
      .in('user_uuid', user_uuids)

    if (users_result.error) {
      throw users_result.error
    }

    for (const row of (users_result.data ?? []) as profile_row[]) {
      if (row.user_uuid) {
        user_profiles.set(row.user_uuid, row)
      }
    }
  }

  if (visitor_uuids.length > 0) {
    const visitors_result = await supabase
      .from('visitors')
      .select('visitor_uuid, display_name')
      .in('visitor_uuid', visitor_uuids)

    if (visitors_result.error) {
      throw visitors_result.error
    }

    for (const row of (visitors_result.data ?? []) as profile_row[]) {
      if (row.visitor_uuid) {
        visitor_profiles.set(row.visitor_uuid, row)
      }
    }
  }

  return { user_profiles, visitor_profiles }
}

export async function list_room_presence(input: {
  room_uuid: string
}): Promise<{
  participants: presence_participant[]
  active_participants: ReturnType<typeof decide_active_participants>
  typing_participants: ReturnType<typeof decide_typing_participants>
}> {
  const participants_result = await supabase
    .from('participants')
    .select(
      'participant_uuid, room_uuid, user_uuid, visitor_uuid, role, is_active, is_typing, last_seen_at, typing_at',
    )
    .eq('room_uuid', input.room_uuid)

  if (participants_result.error) {
    throw participants_result.error
  }

  const rows = (participants_result.data ?? []) as participant_row[]
  const profiles = await load_profiles(rows)
  const participants = rows.map((row) =>
    to_presence_participant({
      row,
      ...profiles,
    }),
  )
  const now = new Date()

  return {
    participants,
    active_participants: decide_active_participants(participants),
    typing_participants: decide_typing_participants(participants, now),
  }
}

export async function resolve_admin_room_typing_banner_lines(input: {
  room_uuid: string
  viewer_participant_uuid: string
}): Promise<string[]> {
  const room_uuid = clean_uuid(input.room_uuid)
  const viewer = clean_uuid(input.viewer_participant_uuid)

  if (!room_uuid || !viewer) {
    return []
  }

  const result = await supabase
    .from('participants')
    .select('participant_uuid, user_uuid, role, is_typing, typing_at')
    .eq('room_uuid', room_uuid)
    .neq('participant_uuid', viewer)

  if (result.error) {
    throw result.error
  }

  const rows = (result.data ?? []) as Array<{
    participant_uuid: string
    user_uuid: string | null
    role: string | null
    is_typing: boolean | null
    typing_at: string | null
  }>

  const now = new Date()
  const staff_user_set = new Set<string>()
  let user_typing = false
  let bot_typing = false

  for (const row of rows) {
    const role = row.role?.trim().toLowerCase() ?? ''

    if (!typing_timestamp_is_fresh(row.typing_at, row.is_typing, now)) {
      continue
    }

    if (role === 'user') {
      user_typing = true
    }

    if (role === 'bot') {
      bot_typing = true
    }

    if ((role === 'admin' || role === 'concierge') && row.user_uuid) {
      const u = clean_uuid(row.user_uuid)

      if (u) {
        staff_user_set.add(u)
      }
    }
  }

  const label_map = await batch_resolve_admin_operator_display(
    [...staff_user_set],
    'memo_list',
  )
  const lines: string[] = []

  if (user_typing) {
    lines.push('入力中...')
  }

  for (const uuid of staff_user_set) {
    const label = label_map.get(uuid) ?? 'Staff'
    lines.push(`${label} が入力中...`)
  }

  if (bot_typing) {
    lines.push('Bot が入力中...')
  }

  return lines
}

export async function list_reception_room_cards(
  query: reception_room_card_query,
): Promise<reception_room_card[]> {
  const limit = Math.max(1, Math.min(query.limit, 100))
  let rooms_query = supabase
    .from('rooms')
    .select('room_uuid, status, mode, action_id, updated_at')
    .eq('room_type', 'direct')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (query.statuses && query.statuses.length > 0) {
    rooms_query = rooms_query.in('status', query.statuses)
  }

  if (query.modes && query.modes.length > 0) {
    rooms_query = rooms_query.in('mode', query.modes)
  }

  const rooms_result = await rooms_query

  if (rooms_result.error) {
    throw rooms_result.error
  }

  const rooms = (rooms_result.data ?? []) as room_row[]

  if (rooms.length === 0) {
    return []
  }

  const room_uuids = rooms.map((row) => row.room_uuid)
  const participants_result = await supabase
    .from('participants')
    .select(
      'participant_uuid, room_uuid, user_uuid, visitor_uuid, role, last_channel, status, is_active, is_typing, last_seen_at, typing_at',
    )
    .in('room_uuid', room_uuids)

  if (participants_result.error) {
    throw participants_result.error
  }

  const participants = (participants_result.data ?? []) as participant_row[]
  const profiles = await load_profiles(participants)
  const messages_result = await supabase
    .from('messages')
    .select('room_uuid, body, created_at')
    .in('room_uuid', room_uuids)
    .order('created_at', { ascending: false })
    .limit(limit * 8)

  if (messages_result.error) {
    throw messages_result.error
  }

  const latest_message_by_room = new Map<string, message_row>()

  for (const row of (messages_result.data ?? []) as message_row[]) {
    if (!latest_message_by_room.has(row.room_uuid)) {
      latest_message_by_room.set(row.room_uuid, row)
    }
  }

  const now = new Date()

  return rooms.map((room) => {
    const room_participant_rows = participants.filter(
      (row) => row.room_uuid === room.room_uuid,
    )
    const presence_participants = room_participant_rows.map((row) =>
      to_presence_participant({
        row,
        ...profiles,
      }),
    )
    const user_row =
      room_participant_rows.find((row) => row.role === 'user') ?? null
    const latest = latest_message_by_room.get(room.room_uuid) ?? null
    const user_presence = user_row
      ? to_presence_participant({
          row: user_row,
          ...profiles,
        })
      : null

    const typing_visible = decide_typing_participants(
      presence_participants,
      now,
    )
    const staff_lines = typing_visible
      .filter(
        (participant) =>
          participant.role === 'admin' ||
          participant.role === 'concierge' ||
          participant.role === 'bot',
      )
      .map((participant) =>
        participant.role === 'bot'
          ? 'Bot が入力中...'
          : `${participant.display_name} が入力中...`,
      )
    const typing_user_active = typing_visible.some(
      (participant) => participant.role === 'user',
    )
    const base_preview = extract_text_from_message_body(latest?.body ?? null)
    const preview_resolved = resolve_chat_room_list_preview_text({
      audience: 'admin_inbox',
      latest_message_text: base_preview,
      typing_user_active,
      typing_staff_lines: staff_lines,
      typing_placeholder_ja: '入力中...',
      fallback_when_empty: '対応が必要です',
    })

    return {
      room_uuid: room.room_uuid,
      display_name: user_presence?.display_name ?? null,
      avatar_url: user_presence?.avatar_url ?? null,
      latest_message_text: preview_resolved,
      latest_message_at: latest?.created_at ?? null,
      active_participants: decide_active_participants(presence_participants),
      typing_participants: typing_visible,
    }
  })
}
