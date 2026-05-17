// ============================================================================
// Admin reception STATE rules (pure)
// ----------------------------------------------------------------------------
// Source of truth: `public.receptions.state` (`open` | `closed`).
// ============================================================================

export type reception_state = 'open' | 'closed'

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
 * Default state when no receptions row exists for an admin.
 */
export const default_reception_state: reception_state = 'closed'

export function is_reception_state(value: unknown): value is reception_state {
  return value === 'open' || value === 'closed'
}

/**
 * Accept legacy `offline` as `closed` for older clients.
 */
export function normalize_reception_state(value: unknown): reception_state | null {
  if (value === 'open') {
    return 'open'
  }

  if (value === 'closed' || value === 'offline') {
    return 'closed'
  }

  return null
}

/**
 * Pure parser for incoming reception mutation requests.
 * - When `state` is 'open' or 'closed', it is treated as an explicit set.
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

  const normalized = normalize_reception_state(raw)

  if (normalized) {
    return {
      ok: true,
      request: { kind: 'set', state: normalized },
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
  return state === 'open' ? 'closed' : 'open'
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

export function should_admin_receive_concierge_notify(
  state: reception_state | null,
): boolean {
  return state === 'open'
}

export function is_reception_open(state: reception_state | null): boolean {
  return state === 'open'
}
