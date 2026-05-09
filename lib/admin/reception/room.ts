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

const room_select =
  'room_uuid, room_type, status, mode, action_id, created_at, updated_at'

function normalize_room(row: room_row): reception_room {
  const mode = row.mode === 'bot' ? 'bot' : 'concierge'

  return {
    room_uuid: row.room_uuid,
    title: mode === 'concierge' ? 'Concierge room' : 'Bot room',
    preview: mode === 'concierge' ? '対応が必要です' : 'ボット対応中',
    updated_at: row.updated_at,
    mode,
  }
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

  return ((result.data ?? []) as room_row[]).map(normalize_room)
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

  return result.data ? normalize_room(result.data as room_row) : null
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
