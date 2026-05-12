import 'server-only'

import { debug_control } from '@/lib/debug/control'
import { debug_event } from '@/lib/debug/index'
import { load_archived_messages } from '@/lib/chat/archive'
import { resolve_chat_room_list_preview_text } from '@/lib/chat/presence/rules'
import {
  archived_messages_to_reception_timeline,
  compare_chat_room_timeline_messages,
  type chat_room_timeline_message,
} from '@/lib/chat/timeline_display'
import {
  admin_chat_unset_customer_label,
  build_identity_display_bundles,
  load_admin_chat_schema_snapshot,
  pick_users_select_list,
  resolve_admin_chat_customer_card_label,
  type identity_display_bundle,
  type resolved_admin_chat_customer_source,
} from '@/lib/auth/customer_display'
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
  participant_uuid?: string | null
  room_uuid: string | null
  user_uuid: string | null
  visitor_uuid: string | null
  role: string | null
  display_name?: string | null
}

type customer_identity_resolve_debug_event =
  | 'admin_chat_customer_identity_resolve_started'
  | 'admin_chat_customer_identity_resolve_succeeded'
  | 'admin_chat_customer_identity_resolve_failed'

type room_card_enrichment = {
  display_name: string | null
  role: string | null
  tier: string | null
  avatar_url: string | null
  preview: string | null
}

type admin_chat_list_debug_event =
  | 'admin_chat_list_load_started'
  | 'admin_chat_list_query_failed'
  | 'admin_chat_list_query_succeeded'
  | 'admin_chat_list_filtered_empty'
  | 'admin_chat_list_normalize_failed'

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

function error_field(error: unknown, key: string): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const value = (error as Record<string, unknown>)[key]

  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function error_message(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return error_field(error, 'message')
}

async function emit_admin_chat_list_debug(input: {
  event: admin_chat_list_debug_event
  raw_room_count?: number | null
  filtered_room_count?: number | null
  filter_reason_counts?: Record<string, number>
  error?: unknown
  phase: string
}) {
  await debug_event({
    category: 'admin_chat',
    event: input.event,
    payload: {
      raw_room_count: input.raw_room_count ?? null,
      filtered_room_count: input.filtered_room_count ?? null,
      filter_reason_counts: input.filter_reason_counts ?? {},
      error_code: error_field(input.error, 'code'),
      error_message: error_message(input.error),
      error_details: error_field(input.error, 'details'),
      error_hint: error_field(input.error, 'hint'),
      phase: input.phase,
    },
  })
}

function increment_reason(
  counts: Record<string, number>,
  reason: string,
) {
  counts[reason] = (counts[reason] ?? 0) + 1
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
      : admin_chat_unset_customer_label
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

async function emit_customer_identity_resolve(input: {
  event: customer_identity_resolve_debug_event
  room_uuid: string
  customer_participant_uuid: string | null
  customer_user_uuid: string | null
  user_tier: string | null
  has_user_uuid: boolean
  has_display_name: boolean
  has_identity: boolean
  resolved_display_name_source: resolved_admin_chat_customer_source
  reason: string | null
}) {
  const payload =
    input.event === 'admin_chat_customer_identity_resolve_succeeded'
      ? {
          resolved_display_name_source: input.resolved_display_name_source,
          room_uuid: input.room_uuid,
          customer_participant_uuid: input.customer_participant_uuid,
          customer_user_uuid: input.customer_user_uuid,
          user_tier: input.user_tier,
          has_user_uuid: input.has_user_uuid,
          has_display_name: input.has_display_name,
          has_identity: input.has_identity,
          reason: input.reason,
        }
      : {
          room_uuid: input.room_uuid,
          customer_participant_uuid: input.customer_participant_uuid,
          customer_user_uuid: input.customer_user_uuid,
          user_tier: input.user_tier,
          has_user_uuid: input.has_user_uuid,
          has_display_name: input.has_display_name,
          has_identity: input.has_identity,
          resolved_display_name_source: input.resolved_display_name_source,
          reason: input.reason,
        }

  await debug_event({
    category: 'admin_chat',
    event: input.event,
    payload,
  })
}

async function fetch_user_profile_row_by_uuid(
  user_uuid: string,
  users_select: string,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await supabase
      .from('users')
      .select(users_select)
      .eq('user_uuid', user_uuid)
      .maybeSingle()

    if (result.error || !result.data) {
      return null
    }

    return result.data as unknown as Record<string, unknown>
  } catch {
    return null
  }
}

async function backfill_missing_users(
  user_uuids: string[],
  users_by_uuid: Map<string, Record<string, unknown>>,
  users_select: string,
) {
  const missing = user_uuids.filter((u) => !users_by_uuid.has(u))

  await Promise.all(
    missing.map(async (u) => {
      const row = await fetch_user_profile_row_by_uuid(u, users_select)

      if (row) {
        users_by_uuid.set(u, row)
      }
    }),
  )
}

async function emit_admin_chat_trace(input: {
  event: 'concierge_room_filtered' | 'concierge_room_display_name_missing'
  room_uuid: string
  reason: string
  user_uuid: string | null
  user_tier: string | null
  participant_role: string | null
  room_type: string | null
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

let admin_chat_schema_columns_debug_emitted = false

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
      .select('participant_uuid, room_uuid, user_uuid, visitor_uuid, role')
      .in('room_uuid', room_uuids)

    if (participant_result.error) {
      await emit_admin_chat_list_debug({
        event: 'admin_chat_list_query_failed',
        raw_room_count: rows.length,
        filtered_room_count: null,
        error: participant_result.error,
        phase: 'participants_query',
      })
    } else {
      participants = (participant_result.data ?? []) as participant_row[]
    }
  } catch (error) {
    await emit_admin_chat_list_debug({
      event: 'admin_chat_list_query_failed',
      raw_room_count: rows.length,
      filtered_room_count: null,
      error,
      phase: 'participants_query',
    })
    participants = []
  }

  const user_uuid_by_room = new Map<string, string>()

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
      const uid = string_value(customer.user_uuid)

      if (uid) {
        user_uuid_by_room.set(room_uuid, uid)
      }
    }
  }

  const user_uuids = Array.from(new Set(user_uuid_by_room.values()))

  const users_by_uuid = new Map<string, Record<string, unknown>>()
  const identities_by_user_uuid = new Map<string, identity_display_bundle>()

  if (user_uuids.length > 0) {
    const schema_snapshot = await load_admin_chat_schema_snapshot(supabase)
    const users_select_list = pick_users_select_list(schema_snapshot)

    if (!admin_chat_schema_columns_debug_emitted) {
      admin_chat_schema_columns_debug_emitted = true
      await debug_event({
        category: 'admin_chat',
        event: 'admin_chat_schema_columns_loaded',
        payload: {
          users_columns: schema_snapshot?.users_columns ?? [],
          identities_columns: schema_snapshot?.identities_columns ?? [],
        },
      })
    }

    try {
      const user_result = await supabase
        .from('users')
        .select(users_select_list)
        .in('user_uuid', user_uuids)

      if (user_result.error) {
        await emit_admin_chat_list_debug({
          event: 'admin_chat_list_query_failed',
          raw_room_count: rows.length,
          filtered_room_count: null,
          error: user_result.error,
          phase: 'users_query',
        })
      } else {
        for (const user of (user_result.data ?? []) as unknown as Record<
          string,
          unknown
        >[]) {
          const uid = pick_string(user['user_uuid'])

          if (uid) {
            users_by_uuid.set(uid, user)
          }
        }
      }
    } catch (error) {
      await emit_admin_chat_list_debug({
        event: 'admin_chat_list_query_failed',
        raw_room_count: rows.length,
        filtered_room_count: null,
        error,
        phase: 'users_query',
      })
    }

    try {
      const identity_result = await supabase
        .from('identities')
        .select('*')
        .in('user_uuid', user_uuids)

      if (identity_result.error) {
        await emit_admin_chat_list_debug({
          event: 'admin_chat_list_query_failed',
          raw_room_count: rows.length,
          filtered_room_count: null,
          error: identity_result.error,
          phase: 'identities_query',
        })
      } else {
        const merged = build_identity_display_bundles(
          (identity_result.data ?? []) as Record<string, unknown>[],
        )

        for (const [user_uuid, row] of merged) {
          identities_by_user_uuid.set(user_uuid, row)
        }
      }
    } catch (error) {
      await emit_admin_chat_list_debug({
        event: 'admin_chat_list_query_failed',
        raw_room_count: rows.length,
        filtered_room_count: null,
        error,
        phase: 'identities_query',
      })
    }

    await backfill_missing_users(user_uuids, users_by_uuid, users_select_list)
  }

  let preview_by_room = new Map<string, string>()

  try {
    preview_by_room = await read_latest_message_previews(room_uuids)
  } catch (error) {
    await emit_admin_chat_list_debug({
      event: 'admin_chat_list_query_failed',
      raw_room_count: rows.length,
      filtered_room_count: null,
      error,
      phase: 'latest_messages_query',
    })
  }

  for (const row of rows) {
    const room_ps = participants_by_room.get(row.room_uuid) ?? []
    const customer = choose_customer_user_participant(room_ps)
    const customer_user_uuid = string_value(customer?.user_uuid ?? null)
    const customer_user = customer_user_uuid
      ? users_by_uuid.get(customer_user_uuid)
      : null
    const identity = customer_user_uuid
      ? identities_by_user_uuid.get(customer_user_uuid) ?? null
      : null

    const base_preview = preview_by_room.get(row.room_uuid) ?? null
    const preview_resolved = resolve_chat_room_list_preview_text({
      audience: 'admin_inbox',
      latest_message_text: base_preview,
      typing_user_active: false,
      typing_staff_lines: [],
      typing_placeholder_ja: '入力中...',
      fallback_when_empty: '対応が必要です',
    })

    const has_user_uuid = Boolean(customer_user_uuid)
    const has_display_name = Boolean(
      customer_user && pick_string(customer_user['display_name']),
    )
    const has_identity = Boolean(
      identity &&
        (string_value(identity.line_profile_display_name) ||
          string_value(identity.provider_id) ||
          string_value(identity.provider)),
    )

    if (has_user_uuid) {
      await emit_customer_identity_resolve({
        event: 'admin_chat_customer_identity_resolve_started',
        room_uuid: row.room_uuid,
        customer_participant_uuid: string_value(
          customer?.participant_uuid ?? null,
        ),
        customer_user_uuid,
        user_tier: pick_string(customer_user?.['tier']),
        has_user_uuid: true,
        has_display_name,
        has_identity,
        resolved_display_name_source: 'unset',
        reason: 'resolve_started',
      })
    }

    const resolved = resolve_admin_chat_customer_card_label({
      user: customer_user ?? null,
      identity: identity ?? null,
      customer,
    })

    if (has_user_uuid) {
      if (resolved.source === 'unset') {
        await emit_customer_identity_resolve({
          event: 'admin_chat_customer_identity_resolve_failed',
          room_uuid: row.room_uuid,
          customer_participant_uuid: string_value(
            customer?.participant_uuid ?? null,
          ),
          customer_user_uuid,
          user_tier: pick_string(customer_user?.['tier']),
          has_user_uuid: true,
          has_display_name,
          has_identity,
          resolved_display_name_source: resolved.source,
          reason: !customer_user
            ? 'user_row_not_found_after_batch_and_backfill'
            : 'no_display_source_after_resolve',
        })
      } else {
        await emit_customer_identity_resolve({
          event: 'admin_chat_customer_identity_resolve_succeeded',
          room_uuid: row.room_uuid,
          customer_participant_uuid: string_value(
            customer?.participant_uuid ?? null,
          ),
          customer_user_uuid,
          user_tier: pick_string(customer_user?.['tier']),
          has_user_uuid: true,
          has_display_name,
          has_identity,
          resolved_display_name_source: resolved.source,
          reason: null,
        })
      }
    }

    if (
      list_mode === 'concierge' &&
      resolved.title === admin_chat_unset_customer_label &&
      !has_user_uuid
    ) {
      await emit_admin_chat_trace({
        event: 'concierge_room_display_name_missing',
        room_uuid: row.room_uuid,
        reason: 'used_unset_customer_label_guest',
        user_uuid: null,
        user_tier: null,
        participant_role: string_value(customer?.role),
        room_type: row.room_type,
      })
    }

    enrichments.set(row.room_uuid, {
      display_name: resolved.title,
      role:
        pick_string(customer_user?.['role']) ??
        string_value(customer?.role),
      tier: pick_string(customer_user?.['tier']),
      avatar_url: pick_string(customer_user?.['image_url']),
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
      .select('participant_uuid, room_uuid, user_uuid, visitor_uuid, role')
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

  const schema_snapshot = await load_admin_chat_schema_snapshot(supabase)
  const users_select_list = pick_users_select_list(schema_snapshot)

  let user: Record<string, unknown> | null = null
  let identity: identity_display_bundle | null = null

  try {
    const user_result = await supabase
      .from('users')
      .select(users_select_list)
      .eq('user_uuid', user_uuid)
      .maybeSingle()

    if (!user_result.error) {
      user = user_result.data as Record<string, unknown> | null
    }
  } catch {
    user = null
  }

  if (!user) {
    user = await fetch_user_profile_row_by_uuid(user_uuid, users_select_list)
  }

  let identity_rows: Record<string, unknown>[] = []

  try {
    const identity_result = await supabase
      .from('identities')
      .select('*')
      .eq('user_uuid', user_uuid)

    if (!identity_result.error) {
      identity_rows = (identity_result.data ?? []) as Record<string, unknown>[]
    }
  } catch {
    identity_rows = []
  }

  const bundles = build_identity_display_bundles(identity_rows)
  identity = bundles.get(user_uuid) ?? null

  const resolved = resolve_admin_chat_customer_card_label({
    user,
    identity,
    customer: subject_participant,
  })

  const display_name =
    resolved.source === 'unset' ? 'ゲスト' : resolved.title

  return {
    display_name,
    role:
      pick_string(user?.['role']) ??
      string_value(subject_participant.role) ??
      'user',
    tier: pick_string(user?.['tier']) ?? 'guest',
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

  const fetch_limit = normalized_limit

  await emit_admin_chat_list_debug({
    event: 'admin_chat_list_load_started',
    raw_room_count: null,
    filtered_room_count: null,
    phase: `rooms_query_${mode}`,
  })

  let query = supabase
    .from('rooms')
    .select(room_select)
    .eq('mode', mode)
    .order('updated_at', { ascending: false })
    .limit(fetch_limit)

  let result: Awaited<typeof query>

  try {
    result = await query
  } catch (error) {
    await emit_admin_chat_list_debug({
      event: 'admin_chat_list_query_failed',
      raw_room_count: null,
      filtered_room_count: null,
      error,
      phase: `rooms_query_${mode}`,
    })

    return []
  }

  if (result.error) {
    await emit_admin_chat_list_debug({
      event: 'admin_chat_list_query_failed',
      raw_room_count: null,
      filtered_room_count: null,
      error: result.error,
      phase: `rooms_query_${mode}`,
    })

    return []
  }

  const rows = (result.data ?? []) as room_row[]

  if (rows.length === 0) {
    await emit_admin_chat_list_debug({
      event: 'admin_chat_list_query_succeeded',
      raw_room_count: 0,
      filtered_room_count: 0,
      phase: `list_reception_rooms_${mode}`,
    })

    await emit_admin_chat_list_debug({
      event: 'admin_chat_list_filtered_empty',
      raw_room_count: 0,
      filtered_room_count: 0,
      filter_reason_counts: { rooms_query_returned_empty: 1 },
      phase: `rooms_query_${mode}`,
    })

    return []
  }

  let enrichments = new Map<string, room_card_enrichment>()

  try {
    enrichments = await enrich_room_cards(rows, mode)
  } catch (error) {
    await emit_admin_chat_list_debug({
      event: 'admin_chat_list_query_failed',
      raw_room_count: rows.length,
      filtered_room_count: null,
      error,
      phase: `enrich_room_cards_${mode}`,
    })
  }

  const kept: reception_room[] = []
  const filter_reason_counts: Record<string, number> = {}

  for (const row of rows) {
    if (kept.length >= normalized_limit) {
      break
    }

    try {
      kept.push(
        normalize_room(row, enrichments.get(row.room_uuid) ?? null, {
          room_uuid_label_fallback: false,
        }),
      )
    } catch (error) {
      increment_reason(filter_reason_counts, 'normalize_failed')
      await emit_admin_chat_list_debug({
        event: 'admin_chat_list_normalize_failed',
        raw_room_count: rows.length,
        filtered_room_count: kept.length,
        filter_reason_counts,
        error,
        phase: `normalize_room_${mode}`,
      })
    }
  }

  if (rows.length > 0 && kept.length === 0) {
    await emit_admin_chat_list_debug({
      event: 'admin_chat_list_filtered_empty',
      raw_room_count: rows.length,
      filtered_room_count: 0,
      filter_reason_counts:
        Object.keys(filter_reason_counts).length > 0
          ? filter_reason_counts
          : { normalize_returned_empty: 1 },
      phase: `normalize_room_${mode}`,
    })
  }

  await emit_admin_chat_list_debug({
    event: 'admin_chat_list_query_succeeded',
    raw_room_count: rows.length,
    filtered_room_count: kept.length,
    phase: `list_reception_rooms_${mode}`,
  })

  return kept
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
