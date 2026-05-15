import 'server-only'

import { debug_event } from '@/lib/debug/index'

export const customer_display_name_fallback = 'お客様'

export type resolved_customer_display_source =
  | 'profiles.display_name'
  | 'users.display_name'
  | 'identities.profile_json.displayName'
  | 'identities.provider_name'
  | 'fallback'

export type resolve_customer_display_name_result = {
  display_name: string
  source: resolved_customer_display_source
  debug: {
    has_profile_display_name: boolean
    has_user_display_name: boolean
    has_identity_name: boolean
  }
}

const IDENTITY_PROFILE_JSON_COLUMNS = [
  'profile_json',
  'line_profile',
  'metadata',
  'provider_profile',
  'profile',
] as const

function trim_string(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parse_json_object(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value === 'string') {
    const raw = value.trim()

    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw) as unknown

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
      } catch {
        return null
      }
    }
  }

  return null
}

function display_name_from_json_blob(value: unknown): string | null {
  const obj = parse_json_object(value)

  if (!obj) {
    return null
  }

  return (
    trim_string(obj.displayName) ??
    trim_string(obj.display_name) ??
    trim_string(obj.name)
  )
}

function identity_rows_line_first(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const a_line = trim_string(a.provider)?.toLowerCase() === 'line' ? 0 : 1
    const b_line = trim_string(b.provider)?.toLowerCase() === 'line' ? 0 : 1

    return a_line - b_line
  })
}

function display_name_from_identity_profile_json(
  rows: Record<string, unknown>[],
): string | null {
  for (const row of identity_rows_line_first(rows)) {
    for (const column of IDENTITY_PROFILE_JSON_COLUMNS) {
      if (!(column in row)) {
        continue
      }

      const label = display_name_from_json_blob(row[column])

      if (label) {
        return label
      }
    }
  }

  return null
}

function provider_name_from_identity_rows(
  rows: Record<string, unknown>[],
): string | null {
  for (const row of identity_rows_line_first(rows)) {
    const label = trim_string(row.provider_name)

    if (label) {
      return label
    }
  }

  return null
}

/**
 * Customer-facing label for admin chat header and room list.
 * Priority: profiles.display_name -> users.display_name ->
 * identities.profile_json.displayName (and LINE profile blobs) ->
 * identities.provider_name -> "お客様".
 */
export function resolve_customer_display_name(input: {
  profile: { display_name?: unknown } | null | undefined
  user: { display_name?: unknown } | null | undefined
  identity_rows: Record<string, unknown>[] | null | undefined
}): resolve_customer_display_name_result {
  const identity_rows = input.identity_rows ?? []
  const profile_display_name = trim_string(input.profile?.display_name)
  const user_display_name = trim_string(input.user?.display_name)
  const identity_profile_name =
    display_name_from_identity_profile_json(identity_rows)
  const identity_provider_name = provider_name_from_identity_rows(identity_rows)
  const has_profile_display_name = Boolean(profile_display_name)
  const has_user_display_name = Boolean(user_display_name)
  const has_identity_name = Boolean(
    identity_profile_name || identity_provider_name,
  )

  const debug = {
    has_profile_display_name,
    has_user_display_name,
    has_identity_name,
  }

  if (profile_display_name) {
    return {
      display_name: profile_display_name,
      source: 'profiles.display_name',
      debug,
    }
  }

  if (user_display_name) {
    return {
      display_name: user_display_name,
      source: 'users.display_name',
      debug,
    }
  }

  if (identity_profile_name) {
    return {
      display_name: identity_profile_name,
      source: 'identities.profile_json.displayName',
      debug,
    }
  }

  if (identity_provider_name) {
    return {
      display_name: identity_provider_name,
      source: 'identities.provider_name',
      debug,
    }
  }

  return {
    display_name: customer_display_name_fallback,
    source: 'fallback',
    debug,
  }
}

export async function emit_customer_display_name_resolved(input: {
  user_uuid: string | null
  room_uuid?: string | null
  result: resolve_customer_display_name_result
}) {
  await debug_event({
    category: 'admin_chat',
    event: 'customer_display_name_resolved',
    payload: {
      user_uuid: input.user_uuid,
      room_uuid: input.room_uuid ?? null,
      resolved_source: input.result.source,
      has_profile_display_name: input.result.debug.has_profile_display_name,
      has_user_display_name: input.result.debug.has_user_display_name,
      has_identity_name: input.result.debug.has_identity_name,
      resolved_display_name: input.result.display_name.slice(0, 200),
    },
  })
}
