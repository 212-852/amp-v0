import 'server-only'

/**
 * Customer-facing display labels from `identities` rows without assuming
 * optional columns (e.g. no fixed `display_name` column in SELECT lists).
 * Reads LINE-style `displayName` from JSON blobs when present on any field.
 */

export type identity_display_bundle = {
  user_uuid: string
  provider: string | null
  provider_id: string | null
  line_profile_display_name: string | null
}

function string_value(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function display_name_from_plain_object(value: Record<string, unknown>): string | null {
  return string_value(value.displayName) ?? string_value(value.display_name)
}

function display_name_from_json_string(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as unknown

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return display_name_from_plain_object(parsed as Record<string, unknown>)
    }
  } catch {
    return null
  }

  return null
}

/**
 * Best-effort LINE / OAuth profile display name from a full `identities` row
 * (`select('*')`). Does not depend on a dedicated DB column existing.
 */
export function extract_line_display_name_from_identity_row(
  row: Record<string, unknown>,
): string | null {
  const direct = display_name_from_plain_object(row)

  if (direct) {
    return direct
  }

  for (const [key, value] of Object.entries(row)) {
    if (
      key === 'user_uuid' ||
      key === 'provider' ||
      key === 'provider_id' ||
      key === 'identity_uuid' ||
      key === 'id' ||
      key === 'created_at' ||
      key === 'updated_at'
    ) {
      continue
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = display_name_from_plain_object(value as Record<string, unknown>)

      if (nested) {
        return nested
      }
    }

    if (typeof value === 'string' && value.trim().startsWith('{')) {
      const parsed = display_name_from_json_string(value)

      if (parsed) {
        return parsed
      }
    }
  }

  return null
}

export function build_identity_display_bundles(
  raw_rows: Record<string, unknown>[],
): Map<string, identity_display_bundle> {
  const grouped = new Map<string, Record<string, unknown>[]>()

  for (const row of raw_rows) {
    const u = string_value(row.user_uuid)

    if (!u) {
      continue
    }

    const list = grouped.get(u) ?? []
    list.push(row)
    grouped.set(u, list)
  }

  const out = new Map<string, identity_display_bundle>()

  for (const [user_uuid, list] of grouped) {
    const sorted = [...list].sort((a, b) => {
      const a_line = string_value(a.provider)?.toLowerCase() === 'line' ? 0 : 1
      const b_line = string_value(b.provider)?.toLowerCase() === 'line' ? 0 : 1

      return a_line - b_line
    })

    let provider: string | null = null
    let provider_id: string | null = null
    let line_profile_display_name: string | null = null

    for (const row of sorted) {
      provider = provider ?? string_value(row.provider)
      provider_id = provider_id ?? string_value(row.provider_id)

      if (!line_profile_display_name) {
        line_profile_display_name =
          extract_line_display_name_from_identity_row(row)
      }
    }

    out.set(user_uuid, {
      user_uuid,
      provider,
      provider_id,
      line_profile_display_name,
    })
  }

  return out
}
