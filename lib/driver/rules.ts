import type { connected_provider } from '@/lib/auth/identity'

export type driver_identity_row = {
  provider: string | null
}

export type driver_route_user = {
  user_uuid: string | null
  role: string | null
}

export type driver_apply_input = {
  full_name: string
  phone: string
  residence_area: string
  experience_years: string
  availability: string
  message: string
}

export type driver_apply_validation =
  | { ok: true; value: driver_apply_input }
  | { ok: false; error: 'invalid_apply_input' }

export type entry_redirect_reason = 'no_line' | null

export function can_access_driver_page(user: driver_route_user): boolean {
  return user.role === 'driver' && typeof user.user_uuid === 'string'
}

export function has_line_identity(identities: driver_identity_row[]): boolean {
  return identities.some((row) => row.provider?.toLowerCase() === 'line')
}

export function can_access_apply(input: {
  user: driver_route_user
  identities: driver_identity_row[]
}): boolean {
  if (!input.user.user_uuid) {
    return false
  }

  return has_line_identity(input.identities)
}

export function parse_entry_redirect_reason(
  value: unknown,
): entry_redirect_reason {
  const raw = Array.isArray(value) ? value[0] : value

  if (raw === 'no_line') {
    return 'no_line'
  }

  return null
}

function trim_field(value: unknown, max_length: number): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, max_length)
}

export function validate_driver_apply_input(
  input: Record<string, unknown> | null | undefined,
): driver_apply_validation {
  const value: driver_apply_input = {
    full_name: trim_field(input?.full_name, 120),
    phone: trim_field(input?.phone, 40),
    residence_area: trim_field(input?.residence_area, 120),
    experience_years: trim_field(input?.experience_years, 40),
    availability: trim_field(input?.availability, 200),
    message: trim_field(input?.message, 2000),
  }

  if (
    !value.full_name ||
    !value.phone ||
    !value.residence_area ||
    !value.availability
  ) {
    return { ok: false, error: 'invalid_apply_input' }
  }

  return { ok: true, value }
}
