export type admin_availability_record = {
  is_available: boolean
  updated_at: string
}

export type admin_availability_state = 'open' | 'offline'

export type admin_availability_request_input = {
  state?: unknown
  is_available?: unknown
}

export type admin_availability_request =
  | { kind: 'set'; is_available: boolean }
  | { kind: 'toggle' }

export function state_from_admin_availability(
  is_available: boolean,
): admin_availability_state {
  return is_available ? 'open' : 'offline'
}

export function admin_availability_from_state(
  state: admin_availability_state,
): boolean {
  return state === 'open'
}

export function is_admin_availability_state(
  value: unknown,
): value is admin_availability_state {
  return value === 'open' || value === 'offline'
}

export function parse_admin_availability_request(
  input: admin_availability_request_input | null | undefined,
):
  | { ok: true; request: admin_availability_request }
  | { ok: false; error: 'invalid_state' } {
  if (typeof input?.is_available === 'boolean') {
    return {
      ok: true,
      request: { kind: 'set', is_available: input.is_available },
    }
  }

  const raw_state = input?.state

  if (raw_state === undefined || raw_state === null) {
    return {
      ok: true,
      request: { kind: 'toggle' },
    }
  }

  if (is_admin_availability_state(raw_state)) {
    return {
      ok: true,
      request: {
        kind: 'set',
        is_available: admin_availability_from_state(raw_state),
      },
    }
  }

  return {
    ok: false,
    error: 'invalid_state',
  }
}

export function resolve_next_admin_availability(
  current: admin_availability_record,
  request: admin_availability_request,
): boolean {
  if (request.kind === 'set') {
    return request.is_available
  }

  return !current.is_available
}

export function should_admin_receive_concierge_notify(
  is_available: boolean | null,
): boolean {
  return is_available === true
}
