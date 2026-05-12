import 'server-only'

import { batch_resolve_admin_operator_display } from '@/lib/admin/profile'
import { debug_control } from '@/lib/debug/control'
import { debug_event } from '@/lib/debug/index'
import { load_archived_messages } from '@/lib/chat/archive'
import {
  resolve_chat_room_list_preview_text,
  typing_timestamp_is_fresh,
} from '@/lib/chat/presence/rules'
import {
  archived_messages_to_reception_timeline,
  compare_chat_room_timeline_messages,
  type chat_room_timeline_message,
} from '@/lib/chat/timeline_display'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { supabase } from '@/lib/db/supabase'

type room_row = {
  room_uuid: string
  room_type: string | null
  status: string | null
  mode: string | null
  action_id: string | null
  created_at: string | null
  updated_at: string | null
  concierge_enabled: boolean | null
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
  is_typing: boolean | null
  typing_at: string | null
}

type user_profile_row = {
  user_uuid: string
  display_name?: string | null
  role?: string | null
  tier?: string | null
  image_url?: string | null
  email?: string | null
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
  'room_uuid, room_type, status, mode, action_id, created_at, updated_at, concierge_enabled'

const unset_customer_label = 'Unset user'

function email_local_part(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') {
    return null
  }

  const trimmed = email.trim()

  if (!trimmed) {
    return null
  }

  const at = trimmed.indexOf('@')

  return at > 0 ? trimmed.slice(0, at) : null
}

function short_room_label(room_uuid: string): string {
  return room_uuid.trim().length > 0
    ? `Room ${room_uuid.slice(0, 8)}`
    : 'Guest'
}

type normalize_room_options = {
  /**
   * When true, concierge rows without enrichment use `Room {uuid}` (internal debug only).
   * Default: public surfaces use a neutral label, never `Room xxxx`.
   */
  room_uuid_label_fallback?: boolean
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
  options?: normalize_room_options,
): reception_room {
  const mode = row.mode === 'bot' ? 'bot' : 'concierge'
  const concierge_name_fallback =
    mode === 'concierge' && options?.room_uuid_label_fallback
      ? short_room_label(row.room_uuid)
      : 'Customer'
  const display_name =
    enrichment?.display_name ??
    (mode === 'concierge' ? concierge_name_fallback : 'Bot room')

  return {
    room_uuid: row.room_uuid,
    display_name,
    role: enrichment?.role ?? null,
    tier: enrichment?.tier ?? null,
    avatar_url: enrichment?.avatar_url ?? null,
    title: display_name,
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
    unset_customer_label
  )
}

function resolve_concierge_list_customer_title(input: {
  user: user_profile_row | null | undefined
  identity: identity_row | null | undefined
  customer: participant_row | null
}): string {
  const from_user = string_value(input.user?.display_name)

  if (from_user) {
    return from_user
  }

  const from_identity =
    string_value(input.identity?.display_name) ??
    string_value(input.identity?.provider_user_name) ??
    string_value(input.identity?.provider_id)

  if (from_identity) {
    return from_identity
  }

  const from_email = email_local_part(input.user?.email)

  if (from_email) {
    return from_email
  }

  return unset_customer_label
}

async function emit_admin_chat_trace(input: {
  event: 'concierge_room_filtered' | 'concierge_room_display_name_missing'
  room_uuid: string
  reason: string
  user_uuid: string | null
  user_tier: string | null
  participant_role: string | null
  room_type: string | null
  concierge_enabled: boolean | null
}) {
  if (debug_control.admin_chat_room_list_debug_enabled) {
    await debug_event({
      category: 'admin_chat',
      event: input.event,
      payload: {
        room_uuid: input.room_uuid,
        reason: input.reason,
        user_uuid: input.user_uuid,
        user_tier: input.user_tier,
        participant_role: input.participant_role,
        room_type: input.room_type,
        concierge_enabled: input.concierge_enabled,
      },
    })
  }
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

function choose_customer_user_participant(
  participants: participant_row[],
): participant_row | null {
  const user_rows = participants.filter((participant) => {
    const role = participant.role?.trim().toLowerCase() ?? ''
    return role === 'user'
  })

  return (
    user_rows.find((row) => string_value(row.user_uuid)) ?? user_rows[0] ?? null
  )
}

async function enrich_room_cards(
  rows: room_row[],
  list_mode: reception_room_mode,
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
      .select(
        'room_uuid, user_uuid, visitor_uuid, role, is_typing, typing_at',
      )
      .in('room_uuid', room_uuids)

    if (!participant_result.error) {
      participants = (participant_result.data ?? []) as participant_row[]
    }
  } catch {
    participants = []
  }

  const user_uuid_by_room = new Map<string, string>()
  const participant_by_room = new Map<string, participant_row>()

  const participants_by_room = new Map<string, participant_row[]>()

  for (const participant of participants) {
    if (!participant.room_uuid) {
      continue
    }

    const list = participants_by_room.get(participant.room_uuid) ?? []
    list.push(participant)
    participants_by_room.set(participant.room_uuid, list)
  }

  for (const room_uuid of room_uuids) {
    const room_ps = participants_by_room.get(room_uuid) ?? []
    const customer = choose_customer_user_participant(room_ps)

    if (customer) {
      participant_by_room.set(room_uuid, customer)
      const uid = string_value(customer.user_uuid)

      if (uid) {
        user_uuid_by_room.set(room_uuid, uid)
      }
    }
  }

  const user_uuids = Array.from(new Set(user_uuid_by_room.values()))

  const users_by_uuid = new Map<string, user_profile_row>()
  const identities_by_user_uuid = new Map<string, identity_row>()

  if (user_uuids.length > 0) {
    try {
      const user_result = await supabase
        .from('users')
        .select('user_uuid, display_name, role, tier, image_url, email')
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

  const now = new Date()
  const staff_user_for_labels = new Set<string>()

  for (const row of rows) {
    const room_ps = participants_by_room.get(row.room_uuid) ?? []

    for (const p of room_ps) {
      const role = p.role?.trim().toLowerCase() ?? ''

      if (
        (role === 'admin' || role === 'concierge') &&
        p.user_uuid &&
        typing_timestamp_is_fresh(p.typing_at, p.is_typing, now)
      ) {
        const u = clean_uuid(p.user_uuid)

        if (u) {
          staff_user_for_labels.add(u)
        }
      }
    }
  }

  const staff_labels = await batch_resolve_admin_operator_display(
    [...staff_user_for_labels],
    'memo_list',
  )

  for (const row of rows) {
    const user_uuid = user_uuid_by_room.get(row.room_uuid) ?? null
    const participant = participant_by_room.get(row.room_uuid) ?? null
    const user = user_uuid ? users_by_uuid.get(user_uuid) : null
    const room_ps = participants_by_room.get(row.room_uuid) ?? []
    let typing_user_active = false
    const staff_lines: string[] = []

    for (const p of room_ps) {
      const role = p.role?.trim().toLowerCase() ?? ''

      if (!typing_timestamp_is_fresh(p.typing_at, p.is_typing, now)) {
        continue
      }

      if (role === 'user') {
        typing_user_active = true
      }

      if (role === 'admin' || role === 'concierge') {
        const u = clean_uuid(p.user_uuid)
        const name =
          u && staff_labels.has(u)
            ? (staff_labels.get(u) as string)
            : 'Staff'

        staff_lines.push(`${name} が入力中...`)
      } else if (role === 'bot') {
        staff_lines.push('Bot が入力中...')
      }
    }

    const base_preview = preview_by_room.get(row.room_uuid) ?? null
    const preview_resolved = resolve_chat_room_list_preview_text({
      audience: 'admin_inbox',
      latest_message_text: base_preview,
      typing_user_active,
      typing_staff_lines: staff_lines,
      typing_placeholder_ja: '入力中...',
      fallback_when_empty: '対応が必要です',
    })

    if (list_mode === 'concierge') {
      const status_raw = string_value(row.status)?.toLowerCase() ?? ''

      if (status_raw === 'inactive') {
        await emit_admin_chat_trace({
          event: 'concierge_room_filtered',
          room_uuid: row.room_uuid,
          reason: 'room_status_inactive',
          user_uuid: null,
          user_tier: null,
          participant_role: null,
          room_type: row.room_type,
          concierge_enabled: row.concierge_enabled,
        })
        continue
      }

      if (row.concierge_enabled === false) {
        await emit_admin_chat_trace({
          event: 'concierge_room_filtered',
          room_uuid: row.room_uuid,
          reason: 'concierge_disabled',
          user_uuid: null,
          user_tier: null,
          participant_role: null,
          room_type: row.room_type,
          concierge_enabled: row.concierge_enabled,
        })
        continue
      }

      const room_type_raw = string_value(row.room_type)

      if (room_type_raw && room_type_raw !== 'direct') {
        await emit_admin_chat_trace({
          event: 'concierge_room_filtered',
          room_uuid: row.room_uuid,
          reason: 'room_type_not_direct',
          user_uuid: null,
          user_tier: null,
          participant_role: null,
          room_type: row.room_type,
          concierge_enabled: row.concierge_enabled,
        })
        continue
      }

      const customer = choose_customer_user_participant(room_ps)
      const customer_user_uuid = string_value(customer?.user_uuid ?? null)
      const customer_user = customer_user_uuid
        ? users_by_uuid.get(customer_user_uuid)
        : null
      const identity =
        customer_user_uuid && identities_by_user_uuid.has(customer_user_uuid)
          ? identities_by_user_uuid.get(customer_user_uuid) ?? null
          : null

      const resolved_title = resolve_concierge_list_customer_title({
        user: customer_user ?? null,
        identity: identity ?? null,
        customer,
      })

      if (resolved_title === unset_customer_label) {
        await emit_admin_chat_trace({
          event: 'concierge_room_display_name_missing',
          room_uuid: row.room_uuid,
          reason: 'used_unset_customer_label',
          user_uuid: customer_user_uuid,
          user_tier: string_value(customer_user?.tier),
          participant_role: string_value(customer?.role),
          room_type: row.room_type,
          concierge_enabled: row.concierge_enabled,
        })
      }

      enrichments.set(row.room_uuid, {
        display_name: resolved_title,
        role:
          string_value(customer_user?.role) ??
          string_value(customer?.role),
        tier: string_value(customer_user?.tier),
        avatar_url: string_value(customer_user?.image_url),
        preview: preview_resolved,
      })
      continue
    }

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
      preview: preview_resolved,
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

  const fetch_limit =
    mode === 'concierge'
      ? Math.min(Math.max(normalized_limit * 10, normalized_limit), 200)
      : normalized_limit

  let query = supabase
    .from('rooms')
    .select(room_select)
    .eq('mode', mode)
    .order('updated_at', { ascending: false })
    .limit(fetch_limit)

  if (mode === 'concierge') {
    query = query
      .or('room_type.eq.direct,room_type.is.null')
      .or('concierge_enabled.is.null,concierge_enabled.eq.true')
      .or('status.is.null,status.neq.inactive')
  }

  const result = await query

  if (result.error) {
    throw result.error
  }

  const rows = (result.data ?? []) as room_row[]
  const enrichments = await enrich_room_cards(rows, mode)

  if (mode === 'concierge') {
    const kept: reception_room[] = []

    for (const row of rows) {
      const enrichment = enrichments.get(row.room_uuid)

      if (!enrichment) {
        continue
      }

      kept.push(
        normalize_room(row, enrichment, { room_uuid_label_fallback: false }),
      )

      if (kept.length >= normalized_limit) {
        break
      }
    }

    return kept
  }

  return rows.map((row) =>
    normalize_room(row, enrichments.get(row.room_uuid) ?? null, {
      room_uuid_label_fallback: false,
    }),
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
  const list_mode: reception_room_mode =
    row.mode === 'bot' ? 'bot' : 'concierge'
  const enrichments = await enrich_room_cards([row], list_mode)

  return normalize_room(row, enrichments.get(row.room_uuid) ?? null, {
    room_uuid_label_fallback: false,
  })
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
