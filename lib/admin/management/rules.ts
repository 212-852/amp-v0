export type profile_input = {
  real_name?: string | null
  birth_date?: string | null
  work_name?: string | null
}

export function can_update_profile(input: {
  role: string | null | undefined
  tier: string | null | undefined
}): boolean {
  return input.role === 'admin' && (input.tier === 'owner' || input.tier === 'core')
}

export type profile_validated = {
  ok: true
  value: {
    real_name: string | null
    birth_date: string | null
    work_name: string | null
  }
}

export type profile_validation_failed = {
  ok: false
  error:
    | 'real_name_too_long'
    | 'work_name_too_long'
    | 'invalid_birth_date'
}

function nullable_trimmed(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}

function is_valid_birth_date(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  return date.toISOString().slice(0, 10) === value
}

export function validate_profile_input(
  input: profile_input,
): profile_validated | profile_validation_failed {
  const real_name = nullable_trimmed(input.real_name)
  const birth_date = nullable_trimmed(input.birth_date)
  const work_name = nullable_trimmed(input.work_name)

  if (real_name && real_name.length > 80) {
    return { ok: false, error: 'real_name_too_long' }
  }

  if (work_name && work_name.length > 40) {
    return { ok: false, error: 'work_name_too_long' }
  }

  if (birth_date && !is_valid_birth_date(birth_date)) {
    return { ok: false, error: 'invalid_birth_date' }
  }

  return {
    ok: true,
    value: {
      real_name,
      birth_date,
      work_name,
    },
  }
}
