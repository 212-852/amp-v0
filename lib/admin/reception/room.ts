import 'server-only'

import { load_archived_messages } from '@/lib/chat/archive'
import {
  archived_messages_to_reception_timeline,
  compare_chat_room_timeline_messages,
  type chat_room_timeline_message,
} from '@/lib/chat/timeline_display'
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
  role: string | null
  tier: string | null
  avatar_url: string | null
  title: string
  preview: string
  updated_at: string | null
  mode: string | null
}

export type reception_room_mode = 'concierge' | 'bot'

export type reception_room_message = chat_room_timeline_message

type message_row = {
  message_uuid: string
  room_uuid: string
  body: string | null
  created_at: string | null
}

type memo_row = {
  room_uuid: string
  handoff_memo: string | null
  handoff_memo_updated_at: string | null
  handoff_memo_updated_by: string | null
}

type participant_row = {
  room_uuid: string | null
  user_uuid: string | null
  visitor_uuid: string | null
  role: string | null
}

type user_profile_row = {
  user_uuid: string
  display_name?: string | null
  role?: string | null
  tier?: string | null
  image_url?: string | null
}

type identity_row = {
  user_uuid: string | null
  provider_id: string | null
  display_name?: string | null
  provider_user_name?: string | null
}

type room_card_enrichment = {
  display_name: string | null
  role: string | null
  tier: string | null
  avatar_url: string | null
  preview: string | null
}

export type reception_room_subject = {
  display_name: string
  role: string | null
  tier: string | null
  user_uuid: string | null
  visitor_uuid: string | null
}

export type reception_room_memo = {
  room_uuid: string
  handoff_memo: string
  handoff_memo_updated_at: string | null
  handoff_memo_updated_by: string | null
}

const room_select =
  'room_uuid, room_type, status, mode, action_id, created_at, updated_at'

function short_room_label(room_uuid: string): string {
  return room_uuid.trim().length > 0
    ? `Room ${room_uuid.slice(0, 8)}`
    : 'Guest'
}

const guest_subject: reception_room_subject = {
  display_name: 'ゲスト',
  role: 'user',
  tier: 'guest',
  user_uuid: null,
  visitor_uuid: null,
}

function normalize_room(
  row: room_row,
  enrichment: room_card_enrichment | null = null,
): reception_room {
  const mode = row.mode === 'bot' ? 'bot' : 'concierge'

  return {
    room_uuid: row.room_uuid,
    display_name:
      enrichment?.display_name ??
      (mode === 'concierge' ? short_room_label(row.room_uuid) : 'Bot room'),
    role: enrichment?.role ?? null,
    tier: enrichment?.tier ?? null,
    avatar_url: enrichment?.avatar_url ?? null,
    title: mode === 'concierge' ? 'Concierge room' : 'Bot room',
    preview: enrichment?.preview ?? '対応が必要です',
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
    string_value(identity?.display_name) ??
    string_value(identity?.provider_user_name) ??
    string_value(identity?.provider_id) ??
    short_room_label(input.room_uuid) ??
    'Guest'
  )
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

  const metadata = pick_object(body?.metadata)
  const metadata_text = pick_string(metadata?.text)

  if (metadata_text) {
    return metadata_text
  }

  const content_key =
    pick_string(body?.content_key) ?? pick_string(bundle?.content_key)

  return content_key ?? '(message)'
}

function message_sequence_from_body(
  body: Record<string, unknown> | null,
): number | null {
  const bundle = pick_object(body?.bundle)
  return pick_number(body?.sequence) ?? pick_number(bundle?.sequence)
}

async function enrich_room_cards(
  rows: room_row[],
): Promise<Map<string, room_card_enrichment>> {
  const enrichments = new Map<string, room_card_enrichment>()

  if (rows.length === 0) {
    return enrichments
  }

  const room_uuids = rows.map((row) => row.room_uuid)
  let participants: participant_row[] = []

  try {
    const participant_result = await supabase
      .from('participants')
      .select('room_uuid, user_uuid, visitor_uuid, role')
      .in('room_uuid', room_uuids)

    if (!participant_result.error) {
      participants = (participant_result.data ?? []) as participant_row[]
    }
  } catch {
    participants = []
  }

  const user_uuid_by_room = new Map<string, string>()
  const participant_by_room = new Map<string, participant_row>()

  for (const participant of participants) {
    if (
      participant.room_uuid &&
      !participant_by_room.has(participant.room_uuid)
    ) {
      participant_by_room.set(participant.room_uuid, participant)
    }

    if (
      participant.room_uuid &&
      participant.user_uuid &&
      !user_uuid_by_room.has(participant.room_uuid)
    ) {
      user_uuid_by_room.set(participant.room_uuid, participant.user_uuid)
    }
  }

  const user_uuids = Array.from(new Set(user_uuid_by_room.values()))

  const users_by_uuid = new Map<string, user_profile_row>()
  const identities_by_user_uuid = new Map<string, identity_row>()

  if (user_uuids.length > 0) {
    try {
      const user_result = await supabase
        .from('users')
        .select('user_uuid, display_name, role, tier, image_url')
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
  }

  const preview_by_room = await read_latest_message_previews(room_uuids)

  for (const row of rows) {
    const user_uuid = user_uuid_by_room.get(row.room_uuid) ?? null
    const participant = participant_by_room.get(row.room_uuid) ?? null
    const user = user_uuid ? users_by_uuid.get(user_uuid) : null

    enrichments.set(row.room_uuid, {
      display_name: resolve_display_name({
        room_uuid: row.room_uuid,
        user_uuid,
        users_by_uuid,
        identities_by_user_uuid,
      }),
      role: string_value(user?.role) ?? string_value(participant?.role),
      tier: string_value(user?.tier),
      avatar_url: string_value(user?.image_url),
      preview: preview_by_room.get(row.room_uuid) ?? null,
    })
  }

  return enrichments
}

function choose_subject_participant(
  participants: participant_row[],
): participant_row | null {
  const non_bot = participants.filter((participant) => {
    const role = participant.role?.trim().toLowerCase() ?? ''
    return role !== 'bot'
  })

  return (
    non_bot.find((participant) => participant.role === 'user') ??
    non_bot.find((participant) => participant.user_uuid) ??
    non_bot[0] ??
    null
  )
}

export async function resolve_room_subject(
  room_uuid: string,
): Promise<reception_room_subject> {
  let participants: participant_row[] = []

  try {
    const participant_result = await supabase
      .from('participants')
      .select('room_uuid, user_uuid, visitor_uuid, role')
      .eq('room_uuid', room_uuid)

    if (participant_result.error) {
      return guest_subject
    }

    participants = (participant_result.data ?? []) as participant_row[]
  } catch {
    return guest_subject
  }

  const subject_participant = choose_subject_participant(participants)

  if (!subject_participant) {
    return guest_subject
  }

  const user_uuid = subject_participant.user_uuid ?? null
  const visitor_uuid = subject_participant.visitor_uuid ?? null

  if (!user_uuid) {
    return {
      display_name: 'ゲスト',
      role: string_value(subject_participant.role) ?? 'user',
      tier: 'guest',
      user_uuid: null,
      visitor_uuid,
    }
  }

  let user: user_profile_row | null = null
  let identity: identity_row | null = null

  try {
    const user_result = await supabase
      .from('users')
      .select('user_uuid, display_name, role, tier')
      .eq('user_uuid', user_uuid)
      .maybeSingle()

    if (!user_result.error) {
      user = user_result.data as user_profile_row | null
    }
  } catch {
    user = null
  }

  try {
    const identity_result = await supabase
      .from('identities')
      .select('user_uuid, provider_id')
      .eq('user_uuid', user_uuid)
      .limit(1)

    if (!identity_result.error) {
      identity = ((identity_result.data ?? []) as identity_row[])[0] ?? null
    }
  } catch {
    identity = null
  }

  return {
    display_name:
      string_value(user?.display_name) ??
      string_value(identity?.provider_id) ??
      'ゲスト',
    role:
      string_value(user?.role) ??
      string_value(subject_participant.role) ??
      'user',
    tier: string_value(user?.tier) ?? 'guest',
    user_uuid,
    visitor_uuid,
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

  const rows = (result.data ?? []) as room_row[]
  const enrichments = await enrich_room_cards(rows)

  return rows.map((row) =>
    normalize_room(
      row,
      enrichments.get(row.room_uuid) ?? null,
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
  const enrichments = await enrich_room_cards([row])

  return normalize_room(
    row,
    enrichments.get(row.room_uuid) ?? null,
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

function compare_latest_message_rows(a: message_row, b: message_row) {
  const a_body = parse_body(a.body)
  const b_body = parse_body(b.body)
  const a_sequence = message_sequence_from_body(a_body)
  const b_sequence = message_sequence_from_body(b_body)

  if (a_sequence !== null && b_sequence !== null) {
    return b_sequence - a_sequence
  }

  if (a_sequence !== null) {
    return -1
  }

  if (b_sequence !== null) {
    return 1
  }

  return (
    new Date(b.created_at ?? 0).getTime() -
    new Date(a.created_at ?? 0).getTime()
  )
}

async function read_latest_message_previews(
  room_uuids: string[],
): Promise<Map<string, string>> {
  const previews = new Map<string, string>()

  if (room_uuids.length === 0) {
    return previews
  }

  try {
    const result = await supabase
      .from('messages')
      .select('message_uuid, room_uuid, body, created_at')
      .in('room_uuid', room_uuids)
      .order('created_at', { ascending: false })
      .limit(Math.max(50, room_uuids.length * 10))

    if (result.error) {
      return previews
    }

    const rows_by_room = new Map<string, message_row[]>()

    for (const row of (result.data ?? []) as message_row[]) {
      const list = rows_by_room.get(row.room_uuid) ?? []
      list.push(row)
      rows_by_room.set(row.room_uuid, list)
    }

    for (const [room_uuid, rows] of rows_by_room.entries()) {
      const latest = rows.sort(compare_latest_message_rows)[0] ?? null
      const text = latest ? message_text(parse_body(latest.body)) : null

      if (text && text !== '(message)') {
        previews.set(room_uuid, text)
      } else if (text) {
        previews.set(room_uuid, '対応が必要です')
      }
    }
  } catch {
    return previews
  }

  return previews
}

export async function list_reception_room_messages({
  room_uuid,
}: {
  room_uuid: string
}): Promise<reception_room_message[]> {
  const archived = await load_archived_messages(room_uuid)

  return archived_messages_to_reception_timeline(archived).sort(
    compare_chat_room_timeline_messages,
  )
}

function normalize_memo(row: memo_row): reception_room_memo {
  return {
    room_uuid: row.room_uuid,
    handoff_memo: row.handoff_memo ?? '',
    handoff_memo_updated_at: row.handoff_memo_updated_at,
    handoff_memo_updated_by: row.handoff_memo_updated_by,
  }
}

export function normalize_handoff_memo(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, 2000)
}

export async function read_reception_room_memo({
  room_uuid,
}: {
  room_uuid: string
}): Promise<reception_room_memo> {
  const result = await supabase
    .from('rooms')
    .select(
      'room_uuid, handoff_memo, handoff_memo_updated_at, handoff_memo_updated_by',
    )
    .eq('room_uuid', room_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  if (!result.data) {
    return {
      room_uuid,
      handoff_memo: '',
      handoff_memo_updated_at: null,
      handoff_memo_updated_by: null,
    }
  }

  return normalize_memo(result.data as memo_row)
}

export async function update_reception_room_memo({
  room_uuid,
  memo,
  updated_by,
}: {
  room_uuid: string
  memo: string
  updated_by: string
}): Promise<reception_room_memo> {
  const normalized_memo = normalize_handoff_memo(memo)
  const updated_at = new Date().toISOString()

  const result = await supabase
    .from('rooms')
    .update({
      handoff_memo: normalized_memo,
      handoff_memo_updated_at: updated_at,
      handoff_memo_updated_by: updated_by,
    })
    .eq('room_uuid', room_uuid)
    .select(
      'room_uuid, handoff_memo, handoff_memo_updated_at, handoff_memo_updated_by',
    )
    .single()

  if (result.error) {
    throw result.error
  }

  return normalize_memo(result.data as memo_row)
}
