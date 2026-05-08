import 'server-only'

export type admin_availability_state = {
  chat_available: boolean
  updated_at: string
}

export type admin_availability_request_input = {
  chat_available?: unknown
}

export type admin_availability_request =
  | { kind: 'set'; chat_available: boolean }
  | { kind: 'toggle' }

/**
 * Default value when no row has ever been inserted for an admin.
 * "Available" is the safe default so a freshly created admin is reachable.
 */
export const default_admin_chat_available = true

/**
 * Pure parser for incoming availability mutation requests.
 * - When `chat_available` is a boolean, it is treated as an explicit set.
 * - When omitted/null/undefined, the request is treated as a toggle.
 * - Any other type is rejected.
 */
export function parse_admin_availability_request(
  input: admin_availability_request_input | null | undefined,
):
  | { ok: true; request: admin_availability_request }
  | { ok: false; error: 'invalid_chat_available' } {
  const raw = input?.chat_available

  if (raw === undefined || raw === null) {
    return {
      ok: true,
      request: { kind: 'toggle' },
    }
  }

  if (typeof raw === 'boolean') {
    return {
      ok: true,
      request: { kind: 'set', chat_available: raw },
    }
  }

  return {
    ok: false,
    error: 'invalid_chat_available',
  }
}

/**
 * Compute the next availability state for a `toggle` or `set` request.
 * Pure function (no DB access).
 */
export function resolve_next_admin_availability(
  current: admin_availability_state,
  request: admin_availability_request,
): boolean {
  if (request.kind === 'set') {
    return request.chat_available
  }

  return !current.chat_available
}

/**
 * Decide whether an admin's row should receive a concierge_requested
 * notification. Used by notify/rules.ts during target filtering.
 */
export function should_admin_receive_concierge_notify(
  state: admin_availability_state | null,
): boolean {
  if (!state) {
    return default_admin_chat_available
  }

  return state.chat_available === true
}
