export type reception_state = 'open' | 'offline'

export type reception_record = {
  state: reception_state
  updated_at: string
}

export type reception_request_input = {
  state?: unknown
}

export type reception_request =
  | { kind: 'set'; state: reception_state }
  | { kind: 'toggle' }

/**
 * Default state when no row has ever been inserted for an admin.
 * 'open' is the safe default so a freshly created admin is reachable.
 */
export const default_reception_state: reception_state = 'open'

export function is_reception_state(value: unknown): value is reception_state {
  return value === 'open' || value === 'offline'
}

/**
 * Pure parser for incoming reception mutation requests.
 * - When `state` is 'open' or 'offline', it is treated as an explicit set.
 * - When omitted/null/undefined, the request is treated as a toggle.
 * - Any other value is rejected.
 */
export function parse_reception_request(
  input: reception_request_input | null | undefined,
):
  | { ok: true; request: reception_request }
  | { ok: false; error: 'invalid_state' } {
  const raw = input?.state

  if (raw === undefined || raw === null) {
    return {
      ok: true,
      request: { kind: 'toggle' },
    }
  }

  if (is_reception_state(raw)) {
    return {
      ok: true,
      request: { kind: 'set', state: raw },
    }
  }

  return {
    ok: false,
    error: 'invalid_state',
  }
}

export function toggle_reception_state(
  state: reception_state,
): reception_state {
  return state === 'open' ? 'offline' : 'open'
}

/**
 * Compute the next reception state for a `toggle` or `set` request.
 * Pure function (no DB access).
 */
export function resolve_next_reception_state(
  current: reception_record,
  request: reception_request,
): reception_state {
  if (request.kind === 'set') {
    return request.state
  }

  return toggle_reception_state(current.state)
}

/**
 * Decide whether an admin should receive a `concierge_requested`
 * notification. Used by notify/rules.ts during target filtering.
 */
export function should_admin_receive_concierge_notify(
  state: reception_state | null,
): boolean {
  if (state === null) {
    return default_reception_state === 'open'
  }

  return state === 'open'
}

// ============================================================================
// Reception room display name resolver
// ----------------------------------------------------------------------------
// Single source of truth for "what label do we put on a room?".
// Field-tolerant: accepts opaque rows (Record<string, unknown>) so callers do
// not have to assume any column exists. The reception list never crashes on
// missing profile fields; instead the resolver falls through the priority
// chain and lands on a stable default ("Guest").
// ============================================================================

export type room_profile_row = Record<string, unknown> | null | undefined

export type resolve_room_display_name_input = {
  visitor: room_profile_row
  user: room_profile_row
  identity: room_profile_row
  room_uuid: string | null | undefined
}

function pick_string_field(
  row: room_profile_row,
  ...keys: string[]
): string | null {
  if (!row || typeof row !== 'object') {
    return null
  }

  for (const key of keys) {
    const value = (row as Record<string, unknown>)[key]

    if (typeof value === 'string') {
      const trimmed = value.trim()

      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }

  return null
}

function short_room_label(room_uuid: string | null | undefined): string | null {
  if (typeof room_uuid !== 'string') {
    return null
  }

  const trimmed = room_uuid.trim()

  if (trimmed.length === 0) {
    return null
  }

  return `Room ${trimmed.slice(0, 8)}`
}

/**
 * Resolve a display label for a reception room from whatever profile data
 * happens to be available.
 *
 * Priority (first non-empty wins):
 *   1. visitors.nickname
 *   2. users.name | users.display_name
 *   3. identities.provider_user_name | identities.provider_id
 *   4. Room <short room_uuid>
 *   5. "Guest"
 *
 * Always returns a non-empty string. Each step accesses optional fields
 * via bracket lookup, so callers may pass rows fetched with `select('*')`
 * even when the underlying schema lacks the preferred columns.
 */
export function resolve_room_display_name(
  input: resolve_room_display_name_input,
): string {
  const visitor_label = pick_string_field(input.visitor, 'nickname')
  if (visitor_label) {
    return visitor_label
  }

  const user_label = pick_string_field(input.user, 'name', 'display_name')
  if (user_label) {
    return user_label
  }

  const identity_label = pick_string_field(
    input.identity,
    'provider_user_name',
    'provider_id',
  )
  if (identity_label) {
    return identity_label
  }

  const short = short_room_label(input.room_uuid)
  if (short) {
    return short
  }

  return 'Guest'
}

// ============================================================================
// Reception room search filters
// ----------------------------------------------------------------------------
// Pure rules used by the inbox (mini) and the full reception list page.
// All filtering decisions live here; UI components only pass user input.
// ============================================================================

export type reception_room_mode = 'bot' | 'concierge'

export type reception_room_status_mode_filter =
  | 'concierge'
  | 'bot'
  | 'active'
  | 'closed'

export type reception_room_role_filter =
  | 'user'
  | 'driver'
  | 'admin'
  | 'concierge'
  | 'bot'

export type reception_room_participant_summary = {
  participant_uuid: string
  display_name: string
  avatar_url: string | null
  role: reception_room_role_filter
}

export type reception_search_filters = {
  keyword: string | null
  status_mode: reception_room_status_mode_filter | null
  role: reception_room_role_filter | null
  has_typing: boolean
  pending_only: boolean
}

export type reception_room_summary = {
  room_uuid: string
  status: string | null
  mode: reception_room_mode | null
  channel: string | null
  user_uuid: string | null
  visitor_uuid: string | null
  display_name: string | null
  latest_message_text: string | null
  latest_message_at: string | null
  avatar_url: string | null
  typing_participants: reception_room_participant_summary[]
  active_participants: reception_room_participant_summary[]
  participant_roles: reception_room_role_filter[]
  has_typing: boolean
  is_pending: boolean
  updated_at: string | null
  action_id: string | null
}

const reception_status_mode_values: reception_room_status_mode_filter[] = [
  'concierge',
  'bot',
  'active',
  'closed',
]

const reception_role_values: reception_room_role_filter[] = [
  'user',
  'driver',
  'admin',
  'concierge',
  'bot',
]

export function is_reception_status_mode(
  value: unknown,
): value is reception_room_status_mode_filter {
  return (
    typeof value === 'string' &&
    reception_status_mode_values.includes(
      value as reception_room_status_mode_filter,
    )
  )
}

export function is_reception_room_role(
  value: unknown,
): value is reception_room_role_filter {
  return (
    typeof value === 'string' &&
    reception_role_values.includes(value as reception_room_role_filter)
  )
}

function trim_or_null(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function parse_bool(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }

  return false
}

/**
 * Pure parser for filter input from URL params or JSON body.
 * Unknown / invalid values are dropped (never throw).
 */
export function parse_reception_search_filters(
  input:
    | URLSearchParams
    | Record<string, unknown>
    | null
    | undefined,
): reception_search_filters {
  const get = (key: string): unknown => {
    if (!input) {
      return null
    }

    if (input instanceof URLSearchParams) {
      return input.get(key)
    }

    return (input as Record<string, unknown>)[key]
  }

  const status_mode_raw = get('status_mode') ?? get('status')
  const role_raw = get('role')

  return {
    keyword: trim_or_null(get('keyword') ?? get('q')),
    status_mode: is_reception_status_mode(status_mode_raw)
      ? status_mode_raw
      : null,
    role: is_reception_room_role(role_raw) ? role_raw : null,
    has_typing: parse_bool(get('has_typing')),
    pending_only: parse_bool(get('pending_only')),
  }
}

function match_keyword(
  summary: reception_room_summary,
  keyword: string,
): boolean {
  const needle = keyword.toLowerCase()

  return (
    (summary.display_name?.toLowerCase().includes(needle) ?? false) ||
    (summary.latest_message_text?.toLowerCase().includes(needle) ?? false)
  )
}

function match_status_mode(
  summary: reception_room_summary,
  filter: reception_room_status_mode_filter,
): boolean {
  if (filter === 'concierge') {
    return summary.mode === 'concierge'
  }

  if (filter === 'bot') {
    return summary.mode === 'bot'
  }

  if (filter === 'active') {
    return summary.status === 'active'
  }

  if (filter === 'closed') {
    return summary.status !== 'active'
  }

  return true
}

function match_role(
  summary: reception_room_summary,
  role: reception_room_role_filter,
): boolean {
  return summary.participant_roles.includes(role)
}

/**
 * Apply all post-load filters in a single pure pass.
 * Designed to run after `lib/admin/reception/action.ts` loads candidates.
 */
export function apply_reception_search_filters(
  rooms: reception_room_summary[],
  filters: reception_search_filters,
): reception_room_summary[] {
  return rooms.filter((room) => {
    if (filters.keyword && !match_keyword(room, filters.keyword)) {
      return false
    }

    if (filters.status_mode && !match_status_mode(room, filters.status_mode)) {
      return false
    }

    if (filters.role && !match_role(room, filters.role)) {
      return false
    }

    if (filters.has_typing && !room.has_typing) {
      return false
    }

    if (filters.pending_only && !room.is_pending) {
      return false
    }

    return true
  })
}

/**
 * Translate a `status_mode` filter into the SQL `rooms.status` / `rooms.mode`
 * predicate hint used by `lib/admin/reception/action.ts`. Returns the empty
 * arrays when the filter does not constrain the column.
 */
export function resolve_reception_status_mode_query(
  filter: reception_room_status_mode_filter | null,
): {
  statuses: string[] | null
  modes: reception_room_mode[] | null
} {
  if (filter === 'active') {
    return { statuses: ['active'], modes: null }
  }

  if (filter === 'closed') {
    return { statuses: null, modes: null }
  }

  if (filter === 'concierge') {
    return { statuses: null, modes: ['concierge'] }
  }

  if (filter === 'bot') {
    return { statuses: null, modes: ['bot'] }
  }

  return { statuses: null, modes: null }
}
