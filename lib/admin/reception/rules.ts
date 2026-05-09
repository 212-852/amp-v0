// ============================================================================
// Admin reception STATE rules (pure)
// ----------------------------------------------------------------------------
// Owns the state machine for the admin reception toggle (`open` | `offline`).
// Used by:
//   - `lib/admin/reception/action.ts` (DB read/write)
//   - `lib/notify/recipients.ts`     (concierge target filtering)
//   - `app/api/admin/reception/route.ts` (request body parsing)
//
// Room-list helpers (card type, list-input parser, keyword matcher) live
// further down in this same file so all reception rules ship from one place.
// ============================================================================

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
// Reception room cards
// ----------------------------------------------------------------------------
// Single transport shape used by:
//   - core (lib/admin/reception/action.ts) when building cards from DB rows
//   - API (app/api/admin/reception/rooms/route.ts) when serializing
//   - UI  (components/admin/reception.tsx) when rendering
//
// UI never reaches into DB-shaped values. It only consumes this normalized
// card. Add fields here when enrichment is reintroduced.
// ============================================================================

export const RECEPTION_LIST_DEFAULT_LIMIT = 50
export const RECEPTION_LIST_HARD_LIMIT = 100
export const RECEPTION_INBOX_LIMIT = 3

export type reception_card = {
  room_uuid: string
  title: string
  preview: string
  updated_at: string | null
  mode: string | null
  typing_label: string | null
  active_label: string | null
}

export type list_reception_rooms_input = {
  limit: number
  keyword: string | null
}

/**
 * Pure parser for `/api/admin/reception/rooms` query parameters. Always
 * returns a clamped, defaulted shape so callers can pass it straight to
 * the core without re-validating.
 */
export function normalize_list_reception_rooms_input(
  raw: Record<string, unknown> | URLSearchParams | null | undefined,
): list_reception_rooms_input {
  const get = (key: string): unknown => {
    if (!raw) return null
    if (raw instanceof URLSearchParams) return raw.get(key)
    return (raw as Record<string, unknown>)[key]
  }

  let limit = RECEPTION_LIST_DEFAULT_LIMIT
  const limit_raw = get('limit')

  if (typeof limit_raw === 'number' && Number.isFinite(limit_raw)) {
    limit = limit_raw
  } else if (typeof limit_raw === 'string') {
    const parsed = Number(limit_raw)
    if (Number.isFinite(parsed)) {
      limit = parsed
    }
  }

  limit = Math.max(1, Math.min(Math.floor(limit), RECEPTION_LIST_HARD_LIMIT))

  let keyword: string | null = null
  const keyword_raw = get('keyword') ?? get('q')

  if (typeof keyword_raw === 'string') {
    const trimmed = keyword_raw.trim()
    if (trimmed.length > 0) {
      keyword = trimmed
    }
  }

  return { limit, keyword }
}

/**
 * Pure card-side keyword filter. Matches against title / preview /
 * room_uuid (case-insensitive). Empty/whitespace keyword always matches.
 */
export function match_card_keyword(
  card: reception_card,
  keyword: string | null,
): boolean {
  if (!keyword) {
    return true
  }

  const needle = keyword.trim().toLowerCase()

  if (needle.length === 0) {
    return true
  }

  return (
    card.title.toLowerCase().includes(needle) ||
    card.preview.toLowerCase().includes(needle) ||
    card.room_uuid.toLowerCase().includes(needle)
  )
}
