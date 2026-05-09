import 'server-only'

import { supabase } from '@/lib/db/supabase'

type room_row = {
  room_uuid: string
  room_type: string | null
  status: string | null
  mode: string | null
  action_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type reception_room = {
  room_uuid: string
  display_name: string
  title: string
  preview: string
  updated_at: string | null
  mode: string | null
}

export type reception_room_mode = 'concierge' | 'bot'

export type reception_room_message = {
  message_uuid: string
  room_uuid: string
  direction: string | null
  sender: string | null
  role: string | null
  text: string
  created_at: string | null
  sequence: number | null
}

type message_row = {
  message_uuid: string
  room_uuid: string
  body: string | null
  created_at: string | null
}

type participant_row = {
  room_uuid: string | null
  user_uuid: string | null
  role: string | null
}

type user_profile_row = {
  user_uuid: string
  display_name?: string | null
  email?: string | null
  name?: string | null
}

type identity_row = {
  user_uuid: string | null
  provider_id: string | null
  display_name?: string | null
  provider_user_name?: string | null
}

const room_select =
  'room_uuid, room_type, status, mode, action_id, created_at, updated_at'

function short_room_label(room_uuid: string): string {
  return room_uuid.trim().length > 0
    ? `Room ${room_uuid.slice(0, 8)}`
    : 'Guest'
}

function normalize_room(
  row: room_row,
  display_name = short_room_label(row.room_uuid),
): reception_room {
  const mode = row.mode === 'bot' ? 'bot' : 'concierge'

  return {
    room_uuid: row.room_uuid,
    display_name,
    title: mode === 'concierge' ? 'Concierge room' : 'Bot room',
    preview: mode === 'concierge' ? '対応が必要です' : 'ボット対応中',
    updated_at: row.updated_at,
    mode,
  }
}

function string_value(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolve_display_name(input: {
  room_uuid: string
  user_uuid: string | null
  users_by_uuid: Map<string, user_profile_row>
  identities_by_user_uuid: Map<string, identity_row>
}) {
  const user = input.user_uuid
    ? input.users_by_uuid.get(input.user_uuid)
    : null
  const identity = input.user_uuid
    ? input.identities_by_user_uuid.get(input.user_uuid)
    : null

  return (
    string_value(user?.display_name) ??
    string_value(user?.name) ??
    string_value(user?.email) ??
    string_value(identity?.display_name) ??
    string_value(identity?.provider_user_name) ??
    string_value(identity?.provider_id) ??
    short_room_label(input.room_uuid) ??
    'Guest'
  )
}

async function enrich_room_display_names(
  rows: room_row[],
): Promise<Map<string, string>> {
  const display_names = new Map<string, string>()

  if (rows.length === 0) {
    return display_names
  }

  const room_uuids = rows.map((row) => row.room_uuid)
  let participants: participant_row[] = []

  try {
    const participant_result = await supabase
      .from('participants')
      .select('room_uuid, user_uuid, role')
      .in('room_uuid', room_uuids)

    if (!participant_result.error) {
      participants = (participant_result.data ?? []) as participant_row[]
    }
  } catch {
    participants = []
  }

  const user_uuid_by_room = new Map<string, string>()

  for (const participant of participants) {
    if (
      participant.room_uuid &&
      participant.user_uuid &&
      !user_uuid_by_room.has(participant.room_uuid)
    ) {
      user_uuid_by_room.set(participant.room_uuid, participant.user_uuid)
    }
  }

  const user_uuids = Array.from(new Set(user_uuid_by_room.values()))

  if (user_uuids.length === 0) {
    return display_names
  }

  const users_by_uuid = new Map<string, user_profile_row>()
  const identities_by_user_uuid = new Map<string, identity_row>()

  try {
    const user_result = await supabase
      .from('users')
      .select('user_uuid, display_name, email')
      .in('user_uuid', user_uuids)

    if (!user_result.error) {
      for (const user of (user_result.data ?? []) as user_profile_row[]) {
        users_by_uuid.set(user.user_uuid, user)
      }
    }
  } catch {
    // Optional user profile enrichment must not block room rendering.
  }

  try {
    const identity_result = await supabase
      .from('identities')
      .select('user_uuid, provider_id')
      .in('user_uuid', user_uuids)

    if (!identity_result.error) {
      for (const identity of (identity_result.data ?? []) as identity_row[]) {
        if (
          identity.user_uuid &&
          !identities_by_user_uuid.has(identity.user_uuid)
        ) {
          identities_by_user_uuid.set(identity.user_uuid, identity)
        }
      }
    }
  } catch {
    // Optional identity enrichment must not block room rendering.
  }

  for (const row of rows) {
    const user_uuid = user_uuid_by_room.get(row.room_uuid) ?? null
    display_names.set(
      row.room_uuid,
      resolve_display_name({
        room_uuid: row.room_uuid,
        user_uuid,
        users_by_uuid,
        identities_by_user_uuid,
      }),
    )
  }

  return display_names
}

export async function list_reception_rooms({
  mode,
  limit,
}: {
  mode: reception_room_mode
  limit?: number
}): Promise<reception_room[]> {
  const normalized_limit =
    typeof limit === 'number' && Number.isFinite(limit)
      ? Math.max(1, Math.min(Math.floor(limit), 100))
      : 50

  const result = await supabase
    .from('rooms')
    .select(room_select)
    .eq('mode', mode)
    .order('updated_at', { ascending: false })
    .limit(normalized_limit)

  if (result.error) {
    throw result.error
  }

  const rows = (result.data ?? []) as room_row[]
  const display_names = await enrich_room_display_names(rows)

  return rows.map((row) =>
    normalize_room(
      row,
      display_names.get(row.room_uuid) ?? short_room_label(row.room_uuid),
    ),
  )
}

export async function get_reception_room(
  room_uuid: string,
): Promise<reception_room | null> {
  const result = await supabase
    .from('rooms')
    .select(room_select)
    .eq('room_uuid', room_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  if (!result.data) {
    return null
  }

  const row = result.data as room_row
  const display_names = await enrich_room_display_names([row])

  return normalize_room(
    row,
    display_names.get(row.room_uuid) ?? short_room_label(row.room_uuid),
  )
}

export async function read_reception_room({
  room_uuid,
}: {
  room_uuid: string
}): Promise<reception_room | null> {
  return get_reception_room(room_uuid)
}

function parse_body(body: string | null): Record<string, unknown> | null {
  if (!body) {
    return null
  }

  try {
    const parsed = JSON.parse(body)

    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
  } catch {
    return { payload: { text: body } }
  }

  return null
}

function pick_object(
  value: unknown,
): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function pick_string(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function pick_number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function message_text(body: Record<string, unknown> | null): string {
  const payload = pick_object(body?.payload)
  const payload_text = pick_string(payload?.text)

  if (payload_text) {
    return payload_text
  }

  const bundle = pick_object(body?.bundle)
  const bundle_payload = pick_object(bundle?.payload)
  const bundle_payload_text = pick_string(bundle_payload?.text)

  if (bundle_payload_text) {
    return bundle_payload_text
  }

  const content_key =
    pick_string(body?.content_key) ?? pick_string(bundle?.content_key)

  return content_key ?? '(message)'
}

function normalize_message(row: message_row): reception_room_message {
  const body = parse_body(row.body)
  const bundle = pick_object(body?.bundle)
  const metadata = pick_object(body?.metadata)
  const sender =
    pick_string(body?.sender) ??
    pick_string(body?.sender_role) ??
    pick_string(bundle?.sender) ??
    null
  const role =
    pick_string(body?.sender_role) ??
    pick_string(bundle?.sender) ??
    pick_string(body?.actor_type) ??
    pick_string(metadata?.actor_type) ??
    sender
  const direction =
    pick_string(body?.direction) ??
    (sender === 'user' ? 'incoming' : sender ? 'outgoing' : null)
  const sequence =
    pick_number(body?.sequence) ?? pick_number(bundle?.sequence)

  return {
    message_uuid: row.message_uuid,
    room_uuid: row.room_uuid,
    direction,
    sender,
    role,
    text: message_text(body),
    created_at: row.created_at,
    sequence,
  }
}

function compare_messages(
  a: reception_room_message,
  b: reception_room_message,
) {
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

export async function list_reception_room_messages({
  room_uuid,
}: {
  room_uuid: string
}): Promise<reception_room_message[]> {
  const result = await supabase
    .from('messages')
    .select('message_uuid, room_uuid, body, created_at')
    .eq('room_uuid', room_uuid)
    .order('created_at', { ascending: true })

  if (result.error) {
    throw result.error
  }

  return ((result.data ?? []) as message_row[])
    .map(normalize_message)
    .sort(compare_messages)
}
