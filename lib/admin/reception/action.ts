import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid_payload'
import {
  decide_active_participants,
  decide_typing_participants,
  is_participant_role,
  type presence_participant,
} from '@/lib/chat/presence/rules'

import { debug_admin_reception } from './debug'
import {
  apply_reception_search_filters,
  default_reception_state,
  is_reception_room_role,
  is_reception_state,
  parse_reception_request,
  resolve_next_reception_state,
  resolve_reception_status_mode_query,
  should_admin_receive_concierge_notify,
  type reception_record,
  type reception_request_input,
  type reception_room_mode,
  type reception_room_role_filter,
  type reception_room_summary,
  type reception_search_filters,
  type reception_state,
} from './rules'

type reception_row = {
  user_uuid: string
  state: string | null
  created_at: string | null
  updated_at: string
}

const reception_select = 'user_uuid, state, created_at, updated_at'

function row_to_record(row: reception_row | null): reception_record | null {
  if (!row) {
    return null
  }

  if (!is_reception_state(row.state)) {
    return null
  }

  return {
    state: row.state,
    updated_at: row.updated_at,
  }
}

function ensure_admin_uuid(value: string, fn_name: string): string {
  const sanitized = clean_uuid(value)

  if (!sanitized) {
    throw new Error(`${fn_name}: invalid admin_user_uuid (${value})`)
  }

  return sanitized
}

function serialize_error(error: unknown) {
  return {
    error_message: error instanceof Error ? error.message : String(error),
    error_code:
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code ?? null
        : null,
  }
}

/**
 * Read the reception row for an admin. If no row exists, insert one with
 * the default `open` state, and return the resulting record.
 */
export async function read_admin_reception(
  admin_user_uuid: string,
): Promise<reception_record> {
  const sanitized = ensure_admin_uuid(admin_user_uuid, 'read_admin_reception')

  const result = await supabase
    .from('receptions')
    .select(reception_select)
    .eq('user_uuid', sanitized)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const existing = row_to_record(result.data as reception_row | null)

  if (existing) {
    return existing
  }

  const inserted = await supabase
    .from('receptions')
    .upsert(
      {
        user_uuid: sanitized,
        state: default_reception_state,
      },
      { onConflict: 'user_uuid' },
    )
    .select(reception_select)
    .single()

  if (inserted.error) {
    throw inserted.error
  }

  const initialized = row_to_record(inserted.data as reception_row)

  if (initialized) {
    return initialized
  }

  return {
    state: default_reception_state,
    updated_at: new Date().toISOString(),
  }
}

async function upsert_admin_reception(input: {
  admin_user_uuid: string
  state: reception_state
}): Promise<reception_record> {
  const sanitized = ensure_admin_uuid(
    input.admin_user_uuid,
    'upsert_admin_reception',
  )

  const result = await supabase
    .from('receptions')
    .upsert(
      {
        user_uuid: sanitized,
        state: input.state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_uuid' },
    )
    .select(reception_select)
    .single()

  if (result.error) {
    throw result.error
  }

  const record = row_to_record(result.data as reception_row)

  if (record) {
    return record
  }

  return {
    state: input.state,
    updated_at: new Date().toISOString(),
  }
}

export type apply_admin_reception_result =
  | { ok: true; record: reception_record }
  | { ok: false; status: 400; error: 'invalid_state' }

export async function apply_admin_reception_request(input: {
  admin_user_uuid: string
  body: reception_request_input | null | undefined
}): Promise<apply_admin_reception_result> {
  const parsed = parse_reception_request(input.body)

  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      error: parsed.error,
    }
  }

  let current: reception_record

  try {
    current = await read_admin_reception(input.admin_user_uuid)
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      payload: {
        step: 'read_current',
        admin_user_uuid: input.admin_user_uuid,
        ...serialize_error(error),
      },
    })

    throw error
  }

  const next_state = resolve_next_reception_state(current, parsed.request)

  if (next_state === current.state) {
    return {
      ok: true,
      record: current,
    }
  }

  let updated: reception_record

  try {
    updated = await upsert_admin_reception({
      admin_user_uuid: input.admin_user_uuid,
      state: next_state,
    })
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      payload: {
        step: 'update',
        admin_user_uuid: input.admin_user_uuid,
        state: next_state,
        ...serialize_error(error),
      },
    })

    throw error
  }

  return {
    ok: true,
    record: updated,
  }
}

export type reception_summary = {
  open_admin_user_uuids: string[]
  offline_admin_user_uuids: string[]
  open_admin_count: number
  total_admin_count: number
  has_open_admin: boolean
}

/**
 * Aggregated view used by notify/ to decide concierge notification targeting.
 *
 * - `open_admin_user_uuids`: admins whose `receptions.state = 'open'`, OR who
 *   have no row yet (treated as default `open`).
 * - `offline_admin_user_uuids`: admins whose `receptions.state = 'offline'`.
 * - `has_open_admin === false` should trigger owner/core fallback.
 */
export async function summarize_reception(): Promise<reception_summary> {
  const admins_result = await supabase
    .from('users')
    .select('user_uuid')
    .eq('role', 'admin')

  if (admins_result.error) {
    throw admins_result.error
  }

  const admin_user_uuids = (admins_result.data ?? [])
    .map((row) => (row as { user_uuid: string | null }).user_uuid)
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.length > 0,
    )

  if (admin_user_uuids.length === 0) {
    return {
      open_admin_user_uuids: [],
      offline_admin_user_uuids: [],
      open_admin_count: 0,
      total_admin_count: 0,
      has_open_admin: false,
    }
  }

  const reception_result = await supabase
    .from('receptions')
    .select(reception_select)
    .in('user_uuid', admin_user_uuids)

  if (reception_result.error) {
    throw reception_result.error
  }

  const rows = (reception_result.data ?? []) as reception_row[]
  const by_uuid = new Map<string, reception_row>()

  for (const row of rows) {
    by_uuid.set(row.user_uuid, row)
  }

  const open_list: string[] = []
  const offline_list: string[] = []

  for (const admin_user_uuid of admin_user_uuids) {
    const row = by_uuid.get(admin_user_uuid) ?? null
    const record = row_to_record(row)
    const state: reception_state | null = record?.state ?? null

    if (should_admin_receive_concierge_notify(state)) {
      open_list.push(admin_user_uuid)
    } else {
      offline_list.push(admin_user_uuid)
    }
  }

  return {
    open_admin_user_uuids: open_list,
    offline_admin_user_uuids: offline_list,
    open_admin_count: open_list.length,
    total_admin_count: admin_user_uuids.length,
    has_open_admin: open_list.length > 0,
  }
}

// ============================================================================
// Reception room inbox / search loader
// ----------------------------------------------------------------------------
// Single-core data fetch used by the mini inbox and the full reception list
// page. Filtering decisions live in rules.ts; here we only execute queries.
// ============================================================================

const RECEPTION_ROOM_LOAD_HARD_LIMIT = 100

type room_load_query = {
  statuses: string[] | null
  modes: reception_room_mode[] | null
  limit: number
}

type room_row_min = {
  room_uuid: string
  status: string | null
  mode: string | null
  action_id: string | null
  updated_at: string | null
}

type participant_row_min = {
  participant_uuid: string
  room_uuid: string | null
  user_uuid: string | null
  visitor_uuid: string | null
  role: string | null
  last_channel: string | null
  status: string | null
  is_active: boolean | null
  is_typing: boolean | null
  last_seen_at: string | null
  typing_at: string | null
}

type message_row_min = {
  room_uuid: string
  body: string | null
  created_at: string
}

type user_row_min = {
  user_uuid: string
  display_name: string | null
  image_url: string | null
}

type visitor_row_min = {
  visitor_uuid: string
  display_name: string | null
}

function normalize_room_mode(value: string | null): reception_room_mode | null {
  if (value === 'concierge') {
    return 'concierge'
  }

  if (value === 'bot') {
    return 'bot'
  }

  return null
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

    if (bundle.bundle_type === 'text' && typeof bundle.payload?.text === 'string') {
      return bundle.payload.text
    }

    if (bundle.bundle_type) {
      return `[${bundle.bundle_type}]`
    }

    return null
  } catch {
    return null
  }
}

function unique_participant_roles(
  rows: participant_row_min[],
): reception_room_role_filter[] {
  const set = new Set<reception_room_role_filter>()

  for (const row of rows) {
    if (is_reception_room_role(row.role)) {
      set.add(row.role)
    }
  }

  return Array.from(set)
}

function participant_display_name(input: {
  participant: participant_row_min
  users_by_uuid: Map<string, user_row_min>
  visitors_by_uuid: Map<string, visitor_row_min>
}) {
  if (input.participant.user_uuid) {
    return (
      input.users_by_uuid.get(input.participant.user_uuid)?.display_name ?? null
    )
  }

  if (input.participant.visitor_uuid) {
    return (
      input.visitors_by_uuid.get(input.participant.visitor_uuid)
        ?.display_name ?? null
    )
  }

  return null
}

function to_presence_participant(input: {
  participant: participant_row_min
  users_by_uuid: Map<string, user_row_min>
  visitors_by_uuid: Map<string, visitor_row_min>
}): presence_participant {
  const role = is_participant_role(input.participant.role)
    ? input.participant.role
    : 'user'

  return {
    participant_uuid: input.participant.participant_uuid,
    display_name: participant_display_name(input),
    avatar_url: input.participant.user_uuid
      ? input.users_by_uuid.get(input.participant.user_uuid)?.image_url ?? null
      : null,
    role,
    is_active: input.participant.is_active === true,
    is_typing: input.participant.is_typing === true,
    last_seen_at: input.participant.last_seen_at,
    typing_at: input.participant.typing_at,
  }
}

async function load_reception_rooms(
  query: room_load_query,
): Promise<reception_room_summary[]> {
  const limit = Math.max(
    1,
    Math.min(query.limit, RECEPTION_ROOM_LOAD_HARD_LIMIT),
  )

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

  const rooms = (rooms_result.data ?? []) as room_row_min[]

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

  const participants = (participants_result.data ?? []) as participant_row_min[]

  const user_uuids = Array.from(
    new Set(
      participants
        .filter((row) => row.role === 'user' && typeof row.user_uuid === 'string')
        .map((row) => row.user_uuid as string),
    ),
  )
  const users_by_uuid = new Map<string, user_row_min>()
  const visitor_uuids = Array.from(
    new Set(
      participants
        .filter((row) => typeof row.visitor_uuid === 'string')
        .map((row) => row.visitor_uuid as string),
    ),
  )
  const visitors_by_uuid = new Map<string, visitor_row_min>()

  if (user_uuids.length > 0) {
    const users_result = await supabase
      .from('users')
      .select('user_uuid, display_name, image_url')
      .in('user_uuid', user_uuids)

    if (users_result.error) {
      throw users_result.error
    }

    for (const row of (users_result.data ?? []) as user_row_min[]) {
      if (row.user_uuid) {
        users_by_uuid.set(row.user_uuid, row)
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

    for (const row of (visitors_result.data ?? []) as visitor_row_min[]) {
      if (row.visitor_uuid) {
        visitors_by_uuid.set(row.visitor_uuid, row)
      }
    }
  }

  const messages_result = await supabase
    .from('messages')
    .select('room_uuid, body, created_at')
    .in('room_uuid', room_uuids)
    .order('created_at', { ascending: false })
    .limit(limit * 8)

  if (messages_result.error) {
    throw messages_result.error
  }

  const latest_message_by_room = new Map<string, message_row_min>()

  for (const row of (messages_result.data ?? []) as message_row_min[]) {
    if (latest_message_by_room.has(row.room_uuid)) {
      continue
    }

    latest_message_by_room.set(row.room_uuid, row)
  }

  const now = new Date()

  return rooms.map((row) => {
    const room_participants = participants.filter(
      (p) => p.room_uuid === row.room_uuid,
    )
    const user_participant =
      room_participants.find((p) => p.role === 'user') ?? null
    const user_uuid = user_participant?.user_uuid ?? null
    const display_name = user_participant
      ? participant_display_name({
          participant: user_participant,
          users_by_uuid,
          visitors_by_uuid,
        })
      : null
    const avatar_url = user_uuid
      ? users_by_uuid.get(user_uuid)?.image_url ?? null
      : null
    const latest = latest_message_by_room.get(row.room_uuid) ?? null
    const mode = normalize_room_mode(row.mode)
    const status = row.status
    const is_pending = status === 'active' && mode === 'concierge'
    const presence_participants = room_participants.map((participant) =>
      to_presence_participant({
        participant,
        users_by_uuid,
        visitors_by_uuid,
      }),
    )
    const typing_participants = decide_typing_participants(
      presence_participants,
      now,
    )

    return {
      room_uuid: row.room_uuid,
      status,
      mode,
      channel: user_participant?.last_channel ?? null,
      user_uuid,
      visitor_uuid: user_participant?.visitor_uuid ?? null,
      display_name,
      avatar_url,
      latest_message_text: extract_text_from_message_body(latest?.body ?? null),
      latest_message_at: latest?.created_at ?? null,
      typing_participants,
      active_participants: decide_active_participants(presence_participants),
      participant_roles: unique_participant_roles(room_participants),
      has_typing: typing_participants.length > 0,
      is_pending,
      updated_at: row.updated_at,
      action_id: row.action_id,
    }
  })
}

/**
 * Latest active concierge rooms for the admin mini inbox.
 *
 * "Active" = `rooms.status = 'active'` AND `rooms.mode = 'concierge'`.
 * Ordered by `rooms.updated_at` desc; capped by `limit`.
 */
export async function list_active_reception_rooms(input: {
  limit: number
}): Promise<reception_room_summary[]> {
  const safe_limit = Math.max(1, Math.min(input.limit, 20))

  return load_reception_rooms({
    statuses: ['active'],
    modes: ['concierge'],
    limit: safe_limit,
  })
}

/**
 * Filtered reception room list for the full admin reception page.
 *
 * SQL pre-filter: `status_mode` is translated by rules into a single
 * `rooms.status` / `rooms.mode` predicate so we don't fetch the entire
 * table. Remaining filters (keyword, role, pending_only, has_typing) run
 * in-memory via `apply_reception_search_filters` from rules.ts.
 */
export async function search_reception_rooms(
  filters: reception_search_filters,
): Promise<reception_room_summary[]> {
  const sql_hint = resolve_reception_status_mode_query(filters.status_mode)

  const candidates = await load_reception_rooms({
    statuses: sql_hint.statuses,
    modes: sql_hint.modes,
    limit: RECEPTION_ROOM_LOAD_HARD_LIMIT,
  })

  return apply_reception_search_filters(candidates, filters)
}
