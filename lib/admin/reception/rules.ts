// ============================================================================
// Admin reception STATE rules (pure)
// ----------------------------------------------------------------------------
// Compatibility types for the admin reception toggle (`open` | `offline`).
// The source of truth is `public.admin_availability` through `lib/admin/*`.
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
 * Default state when no availability row has ever been inserted for an admin.
 */
export const default_reception_state: reception_state = 'offline'

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
 * Compatibility helper. New code should use `lib/admin/rules.ts`.
 */
export function should_admin_receive_concierge_notify(
  state: reception_state | null,
): boolean {
  return state === 'open'
}
