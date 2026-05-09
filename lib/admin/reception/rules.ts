// ============================================================================
// Admin reception STATE rules (pure)
// ----------------------------------------------------------------------------
// Owns the state machine for the admin reception toggle (`open` | `offline`).
// Used by:
//   - `lib/admin/reception/action.ts` (DB read/write)
//   - `lib/notify/recipients.ts`     (concierge target filtering)
//   - `app/api/admin/reception/route.ts` (request body parsing)
//
// Room-list / inbox filtering used to live here too. After the reception
// page was rebuilt as a minimal `rooms`-only view those helpers are no
// longer needed; if filters come back, add them next to the new
// `lib/admin/reception/rooms.ts` module instead of here.
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
