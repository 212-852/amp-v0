import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid_payload'

import { debug_admin_reception } from './debug'
import {
  apply_reception_search_filters,
  default_reception_state,
  is_reception_room_role,
  is_reception_state,
  parse_reception_request,
  resolve_next_reception_state,
  resolve_reception_status_mode_query,
  resolve_room_display_name,
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
// Source of truth: `rooms` only. Filtering decisions live in rules.ts; here we
// only execute queries.
//
// Column policy:
//   Use ONLY columns proven to exist in the live DB. Presence-style columns
//   (`is_active`, `is_typing`, `last_seen_at`, `typing_at`) ship in a
//   migration that is not applied yet, so they MUST NOT appear in selects.
//   typing/active participant arrays in the summary are intentionally empty
//   until those columns are available.
//
// Failure policy:
//   - `rooms` query failure -> throws ReceptionQueryError (nothing to render).
//   - Any enrichment query failure (participants/users/visitors/messages) is
//     logged via `admin_reception_failed` but never drops the room.
//     Missing fields fall back to null/empty so concierge rooms always
//     surface.
// ============================================================================

const RECEPTION_ROOM_LOAD_HARD_LIMIT = 100

type room_load_query = {
  statuses: string[] | null
  modes: reception_room_mode[] | null
  limit: number
}

/**
 * Annotates a Supabase error with the source query label so the API layer
 * can emit `admin_reception_failed` with `query`, `error_code`,
 * `error_message`, `error_details`, `error_hint`.
 */
class ReceptionQueryError extends Error {
  readonly query: string
  readonly error_code: unknown
  readonly error_message: unknown
  readonly error_details: unknown
  readonly error_hint: unknown

  constructor(query: string, raw: unknown) {
    const fields =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const message =
      typeof fields.message === 'string'
        ? fields.message
        : raw instanceof Error
          ? raw.message
          : 'unknown_error'

    super(`reception_query_failed:${query}: ${message}`)
    this.name = 'ReceptionQueryError'
    this.query = query
    this.error_code = fields.code ?? null
    this.error_message = fields.message ?? message
    this.error_details = fields.details ?? null
    this.error_hint = fields.hint ?? null
  }
}

function fail(query: string, error: unknown): never {
  throw new ReceptionQueryError(query, error)
}

function pick_supabase_error(error: unknown) {
  const fields =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : {}

  return {
    error_code: fields.code ?? null,
    error_message:
      fields.message ?? (error instanceof Error ? error.message : null),
    error_details: fields.details ?? null,
    error_hint: fields.hint ?? null,
  }
}

type room_row_min = {
  room_uuid: string
  room_type: string | null
  status: string | null
  mode: string | null
  action_id: string | null
  created_at: string | null
  updated_at: string | null
}

type participant_safe_row = {
  participant_uuid: string
  room_uuid: string | null
  user_uuid: string | null
  visitor_uuid: string | null
  role: string | null
  status: string | null
}

type opaque_row = Record<string, unknown>

type latest_message_record = {
  row: opaque_row
  created_at: string | null
}

type room_enrichment = {
  participants_by_room: Map<string, participant_safe_row[]>
  users_by_uuid: Map<string, opaque_row>
  visitors_by_uuid: Map<string, opaque_row>
  identities_by_user_uuid: Map<string, opaque_row>
  latest_message_by_room: Map<string, latest_message_record>
}

const EMPTY_ENRICHMENT: room_enrichment = {
  participants_by_room: new Map(),
  users_by_uuid: new Map(),
  visitors_by_uuid: new Map(),
  identities_by_user_uuid: new Map(),
  latest_message_by_room: new Map(),
}

const ROOM_SELECT =
  'room_uuid, room_type, status, mode, action_id, created_at, updated_at'

const PARTICIPANT_SELECT =
  'participant_uuid, room_uuid, user_uuid, visitor_uuid, role, status'

// Side-table selects use `*` because we cannot assume any non-key column
// exists on the live DB (e.g. `visitors.display_name` and friends ship in
// pending migrations). The display logic in rules.ts is field-tolerant.
const USER_SELECT = '*'

const VISITOR_SELECT = '*'

const IDENTITY_SELECT = '*'

function string_field(row: opaque_row | null, key: string): string | null {
  if (!row) {
    return null
  }

  const value = row[key]
  return typeof value === 'string' ? value : null
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

/**
 * Extract a short preview text from a row in `messages`.
 *
 * The body column may store JSON either as a stringified object (current
 * archive writer) or as a Postgres `jsonb` value already parsed by the
 * client. Either shape is accepted, and we look for text under the known
 * locations:
 *   - `bundle.payload.text`  (current archive shape)
 *   - `payload.text`         (legacy / direct payload)
 *   - `text`                 (legacy plain text)
 *
 * Anything else returns null without throwing so concierge rooms still
 * appear when no recognizable preview is available.
 */
function extract_text_from_message_row(
  row: Record<string, unknown>,
): string | null {
  let parsed: unknown = null
  const body_value = row.body

  if (typeof body_value === 'string') {
    try {
      parsed = JSON.parse(body_value)
    } catch {
      parsed = null
    }
  } else if (body_value && typeof body_value === 'object') {
    parsed = body_value
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as {
      bundle?: {
        bundle_type?: string
        payload?: { text?: unknown }
      }
      payload?: { text?: unknown }
      text?: unknown
    }

    const bundle = obj.bundle
    if (bundle && typeof bundle === 'object') {
      const bundle_text = bundle.payload?.text
      if (
        bundle.bundle_type === 'text' &&
        typeof bundle_text === 'string'
      ) {
        return bundle_text
      }

      if (typeof bundle.bundle_type === 'string') {
        return `[${bundle.bundle_type}]`
      }
    }

    const flat_payload_text = obj.payload?.text
    if (typeof flat_payload_text === 'string') {
      return flat_payload_text
    }

    if (typeof obj.text === 'string') {
      return obj.text
    }
  }

  const payload_value = row.payload
  if (payload_value && typeof payload_value === 'object') {
    const flat = (payload_value as { text?: unknown }).text
    if (typeof flat === 'string') {
      return flat
    }
  }

  if (typeof row.text === 'string') {
    return row.text
  }

  return null
}

function unique_participant_roles(
  rows: Array<{ role: string | null }>,
): reception_room_role_filter[] {
  const set = new Set<reception_room_role_filter>()

  for (const row of rows) {
    if (is_reception_room_role(row.role)) {
      set.add(row.role)
    }
  }

  return Array.from(set)
}

/**
 * Source-of-truth rooms query. Throws when `rooms` itself fails so the
 * caller can decide between propagating (full search) and recovering
 * (top mini inbox).
 *
 * Only constraints applied here: optional `status` IN, optional `mode` IN,
 * `order by updated_at desc`, hard `limit`. No `room_type` constraint - a
 * room being concierge mode is enough to surface it.
 */
async function fetch_rooms_only(
  query: room_load_query,
): Promise<room_row_min[]> {
  const limit = Math.max(
    1,
    Math.min(query.limit, RECEPTION_ROOM_LOAD_HARD_LIMIT),
  )

  let rooms_query = supabase
    .from('rooms')
    .select(ROOM_SELECT)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (query.statuses && query.statuses.length > 0) {
    rooms_query = rooms_query.in('status', query.statuses)
  }

  if (query.modes && query.modes.length > 0) {
    rooms_query = rooms_query.in('mode', query.modes)
  }

  const result = await rooms_query

  if (result.error) {
    fail('rooms', result.error)
  }

  return (result.data ?? []) as room_row_min[]
}

/**
 * Best-effort enrichment for an already-loaded set of rooms. Each side
 * query that fails is logged via `admin_reception_failed` (with the query
 * label and full Postgres error fields) but does NOT abort enrichment for
 * the remaining tables, and never drops rooms. Callers always receive a
 * complete (possibly empty-mapped) `room_enrichment`.
 */
async function try_enrich_rooms(
  rooms: room_row_min[],
): Promise<room_enrichment> {
  if (rooms.length === 0) {
    return EMPTY_ENRICHMENT
  }

  const room_uuids = rooms.map((row) => row.room_uuid)
  const participants_by_room = new Map<string, participant_safe_row[]>()
  const users_by_uuid = new Map<string, opaque_row>()
  const visitors_by_uuid = new Map<string, opaque_row>()
  const identities_by_user_uuid = new Map<string, opaque_row>()
  const latest_message_by_room = new Map<string, latest_message_record>()

  let participants: participant_safe_row[] = []

  try {
    const participants_result = await supabase
      .from('participants')
      .select(PARTICIPANT_SELECT)
      .in('room_uuid', room_uuids)

    if (participants_result.error) {
      throw participants_result.error
    }

    participants =
      (participants_result.data ?? []) as participant_safe_row[]

    for (const row of participants) {
      if (typeof row.room_uuid !== 'string') {
        continue
      }

      const list = participants_by_room.get(row.room_uuid) ?? []
      list.push(row)
      participants_by_room.set(row.room_uuid, list)
    }
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      payload: {
        step: 'list_rooms',
        query: 'participants',
        ...pick_supabase_error(error),
      },
    })
  }

  const user_uuids = Array.from(
    new Set(
      participants
        .filter(
          (row) => row.role === 'user' && typeof row.user_uuid === 'string',
        )
        .map((row) => row.user_uuid as string),
    ),
  )
  const visitor_uuids = Array.from(
    new Set(
      participants
        .filter((row) => typeof row.visitor_uuid === 'string')
        .map((row) => row.visitor_uuid as string),
    ),
  )

  if (user_uuids.length > 0) {
    try {
      const users_result = await supabase
        .from('users')
        .select(USER_SELECT)
        .in('user_uuid', user_uuids)

      if (users_result.error) {
        throw users_result.error
      }

      for (const row of (users_result.data ?? []) as opaque_row[]) {
        const user_uuid = string_field(row, 'user_uuid')
        if (user_uuid) {
          users_by_uuid.set(user_uuid, row)
        }
      }
    } catch (error) {
      await debug_admin_reception({
        event: 'admin_reception_failed',
        payload: {
          step: 'list_rooms',
          query: 'users',
          ...pick_supabase_error(error),
        },
      })
    }

    try {
      const identities_result = await supabase
        .from('identities')
        .select(IDENTITY_SELECT)
        .in('user_uuid', user_uuids)

      if (identities_result.error) {
        throw identities_result.error
      }

      for (const row of (identities_result.data ?? []) as opaque_row[]) {
        const user_uuid = string_field(row, 'user_uuid')

        if (!user_uuid || identities_by_user_uuid.has(user_uuid)) {
          continue
        }

        identities_by_user_uuid.set(user_uuid, row)
      }
    } catch (error) {
      await debug_admin_reception({
        event: 'admin_reception_failed',
        payload: {
          step: 'list_rooms',
          query: 'identities',
          ...pick_supabase_error(error),
        },
      })
    }
  }

  if (visitor_uuids.length > 0) {
    try {
      const visitors_result = await supabase
        .from('visitors')
        .select(VISITOR_SELECT)
        .in('visitor_uuid', visitor_uuids)

      if (visitors_result.error) {
        throw visitors_result.error
      }

      for (const row of (visitors_result.data ?? []) as opaque_row[]) {
        const visitor_uuid = string_field(row, 'visitor_uuid')
        if (visitor_uuid) {
          visitors_by_uuid.set(visitor_uuid, row)
        }
      }
    } catch (error) {
      await debug_admin_reception({
        event: 'admin_reception_failed',
        payload: {
          step: 'list_rooms',
          query: 'visitors',
          ...pick_supabase_error(error),
        },
      })
    }
  }

  try {
    const messages_result = await supabase
      .from('messages')
      .select('*')
      .in('room_uuid', room_uuids)
      .order('created_at', { ascending: false })
      .limit(rooms.length * 8)

    if (messages_result.error) {
      throw messages_result.error
    }

    for (const raw of (messages_result.data ?? []) as Array<
      Record<string, unknown>
    >) {
      const room_uuid =
        typeof raw.room_uuid === 'string' ? raw.room_uuid : null

      if (!room_uuid || latest_message_by_room.has(room_uuid)) {
        continue
      }

      latest_message_by_room.set(room_uuid, {
        row: raw,
        created_at:
          typeof raw.created_at === 'string' ? raw.created_at : null,
      })
    }
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      payload: {
        step: 'list_rooms',
        query: 'messages',
        ...pick_supabase_error(error),
      },
    })
  }

  return {
    participants_by_room,
    users_by_uuid,
    visitors_by_uuid,
    identities_by_user_uuid,
    latest_message_by_room,
  }
}

function build_room_summary(
  row: room_row_min,
  enrichment: room_enrichment,
): reception_room_summary {
  const room_participants =
    enrichment.participants_by_room.get(row.room_uuid) ?? []
  const user_participant =
    room_participants.find((p) => p.role === 'user') ?? null
  const direct_user_uuid = user_participant?.user_uuid ?? null
  const visitor_uuid = user_participant?.visitor_uuid ?? null

  // Visitor row may carry a `user_uuid` bridge for sessions that signed in
  // after starting as a guest; honour it so we can still find a label even
  // when the participant row was never updated.
  const visitor_row = visitor_uuid
    ? (enrichment.visitors_by_uuid.get(visitor_uuid) ?? null)
    : null
  const bridged_user_uuid = string_field(visitor_row, 'user_uuid')
  const user_uuid = direct_user_uuid ?? bridged_user_uuid
  const user_row = user_uuid
    ? (enrichment.users_by_uuid.get(user_uuid) ?? null)
    : null
  const identity_row = user_uuid
    ? (enrichment.identities_by_user_uuid.get(user_uuid) ?? null)
    : null

  const display_name = resolve_room_display_name({
    visitor: visitor_row,
    user: user_row,
    identity: identity_row,
    room_uuid: row.room_uuid,
  })

  // Avatar fallback is null per spec: no profile column may be assumed.
  const avatar_url: string | null =
    string_field(user_row, 'image_url') ?? null

  const latest = enrichment.latest_message_by_room.get(row.room_uuid) ?? null
  const latest_text = latest
    ? extract_text_from_message_row(latest.row)
    : null

  const mode = normalize_room_mode(row.mode)
  const status = row.status
  const is_pending = status === 'active' && mode === 'concierge'

  return {
    room_uuid: row.room_uuid,
    status,
    mode,
    channel: null,
    user_uuid,
    visitor_uuid,
    display_name,
    avatar_url,
    latest_message_text: latest_text,
    latest_message_at: latest?.created_at ?? null,
    typing_participants: [],
    active_participants: [],
    participant_roles: unique_participant_roles(room_participants),
    has_typing: false,
    is_pending,
    updated_at: row.updated_at,
    action_id: row.action_id,
  }
}

/**
 * Convenience composition for the full reception list flow. Throws on
 * `rooms` failure (so the search API can return a hard error), otherwise
 * always builds summaries with whatever enrichment succeeded.
 */
async function load_reception_rooms(
  query: room_load_query,
): Promise<reception_room_summary[]> {
  const rooms = await fetch_rooms_only(query)

  if (rooms.length === 0) {
    return []
  }

  const enrichment = await try_enrich_rooms(rooms)
  const summaries = rooms.map((row) => build_room_summary(row, enrichment))

  return summaries.sort((a, b) => {
    const a_time = new Date(
      a.latest_message_at ?? a.updated_at ?? 0,
    ).getTime()
    const b_time = new Date(
      b.latest_message_at ?? b.updated_at ?? 0,
    ).getTime()

    return (
      (Number.isNaN(b_time) ? 0 : b_time) - (Number.isNaN(a_time) ? 0 : a_time)
    )
  })
}

/**
 * Diagnostic query used when the top inbox finds zero concierge rooms.
 * Looks at the most recent rooms regardless of mode so we can tell whether
 * the table is empty, the column is wrong, or simply there are no
 * concierge rooms yet. Errors are captured in the returned payload.
 */
async function diagnose_empty_concierge_rooms(): Promise<{
  diag_total: number
  diag_modes: string[]
  diag_error: ReturnType<typeof pick_supabase_error> | null
}> {
  const result = await supabase
    .from('rooms')
    .select('mode')
    .order('updated_at', { ascending: false })
    .limit(50)

  if (result.error) {
    return {
      diag_total: 0,
      diag_modes: [],
      diag_error: pick_supabase_error(result.error),
    }
  }

  const rows = (result.data ?? []) as Array<{ mode: string | null }>
  const modes = Array.from(
    new Set(
      rows
        .map((row) => row.mode)
        .filter((value): value is string => typeof value === 'string'),
    ),
  )

  return {
    diag_total: rows.length,
    diag_modes: modes,
    diag_error: null,
  }
}

/**
 * Top mini-inbox loader used under the admin header.
 *
 * Behavior contract:
 *   - Source of truth = `rooms` only (`mode = 'concierge'`, ordered by
 *     `updated_at desc`, hard limit).
 *   - Rooms render even when message / participant / user data is missing
 *     (see `inbox_item.tsx` mini fallbacks: "Concierge room",
 *     "対応が必要です", `updated_at`).
 *   - Always emits `reception_top_rooms_loaded` with raw_count,
 *     visible_count, room_uuids, modes.
 *   - When `raw_count === 0`, attaches diagnostic info from the rooms
 *     table so we can distinguish "no concierge rooms yet" from "rooms
 *     query is broken".
 */
export async function list_top_reception_rooms(input: {
  limit: number
}): Promise<reception_room_summary[]> {
  const safe_limit = Math.max(1, Math.min(input.limit, 20))

  let rooms: room_row_min[] = []

  try {
    rooms = await fetch_rooms_only({
      statuses: null,
      modes: ['concierge'],
      limit: safe_limit,
    })
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      payload: {
        step: 'list_rooms',
        query: 'rooms',
        ...pick_supabase_error(error),
      },
    })
    return []
  }

  const raw_count = rooms.length
  const room_uuids = rooms.map((row) => row.room_uuid)
  const modes = Array.from(
    new Set(
      rooms
        .map((row) => row.mode)
        .filter((value): value is string => typeof value === 'string'),
    ),
  )

  if (raw_count === 0) {
    const diag = await diagnose_empty_concierge_rooms()

    await debug_admin_reception({
      event: 'reception_top_rooms_loaded',
      payload: {
        raw_count: 0,
        visible_count: 0,
        room_uuids: [],
        modes: [],
        ...diag,
      },
    })

    return []
  }

  const enrichment = await try_enrich_rooms(rooms)
  const summaries = rooms.map((row) => build_room_summary(row, enrichment))

  await debug_admin_reception({
    event: 'reception_top_rooms_loaded',
    payload: {
      raw_count,
      visible_count: summaries.length,
      room_uuids,
      modes,
    },
  })

  return summaries
}

/**
 * Backwards-compatible alias for the mini inbox loader.
 */
export const list_active_reception_rooms = list_top_reception_rooms

/**
 * Filtered reception room list for the full admin reception page.
 *
 * Default = `rooms.mode = 'concierge'`. Status filters and additional
 * post-filters live in rules.ts.
 */
export async function search_reception_rooms(
  filters: reception_search_filters,
): Promise<reception_room_summary[]> {
  const mode_filter = filters.status_mode ?? 'concierge'
  const sql_hint = resolve_reception_status_mode_query(mode_filter)

  const candidates = await load_reception_rooms({
    statuses: sql_hint.statuses,
    modes: sql_hint.modes,
    limit: RECEPTION_ROOM_LOAD_HARD_LIMIT,
  })

  const effective_filters: reception_search_filters = {
    ...filters,
    status_mode: mode_filter,
  }

  return apply_reception_search_filters(candidates, effective_filters)
}
