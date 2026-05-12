import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

/**
 * Single core for operator-facing labels from `users` + `admin_profiles`.
 * Uses `admin_profiles.internal_name` only (never real_name / birth_date).
 */

export type admin_operator_display_policy =
  | 'memo_snapshot'
  | 'memo_list'
  | 'admin_display'

type users_embed_row = {
  user_uuid: string
  display_name: string | null
  name: string | null
  email: string | null
}

type admin_profile_row = {
  user_uuid: string
  internal_name: string | null
}

function string_value(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function email_local_part(email: string | null): string | null {
  if (!email) {
    return null
  }

  const at = email.indexOf('@')

  return at > 0 ? email.slice(0, at) : null
}

function build_operator_label(
  row: users_embed_row,
  internal_name: string | null,
  policy: admin_operator_display_policy,
): string | null {
  if (internal_name) {
    return internal_name
  }

  const display = string_value(row.display_name)

  if (display) {
    return display
  }

  if (policy !== 'memo_snapshot') {
    const name = string_value(row.name)

    if (name) {
      return name
    }
  }

  if (policy === 'memo_snapshot' || policy === 'memo_list') {
    const local = email_local_part(string_value(row.email))

    if (local) {
      return local
    }
  }

  if (policy === 'admin_display') {
    const local = email_local_part(string_value(row.email))

    if (local) {
      return local
    }

    return string_value(row.email)
  }

  if (policy === 'memo_snapshot' || policy === 'memo_list') {
    return 'Admin'
  }

  return null
}

/**
 * Single core: resolve labels from `admin_profiles.internal_name` + `users`.
 * Deduplicates UUIDs. On read error returns an empty map (callers fall back).
 */
export async function batch_resolve_admin_operator_display(
  user_uuids: ReadonlyArray<string | null | undefined>,
  policy: admin_operator_display_policy,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const cleaned_set = new Set<string>()

  for (const raw of user_uuids) {
    const uuid = clean_uuid(raw)

    if (uuid) {
      cleaned_set.add(uuid)
    }
  }

  const cleaned = [...cleaned_set]

  if (cleaned.length === 0) {
    return map
  }

  const users_result = await supabase
    .from('users')
    .select('user_uuid, display_name, name, email')
    .in('user_uuid', cleaned)

  if (users_result.error) {
    return map
  }

  const profile_result = await supabase
    .from('admin_profiles')
    .select('user_uuid, internal_name')
    .in('user_uuid', cleaned)

  const internal_by_user = new Map<string, string | null>()

  if (!profile_result.error) {
    for (const raw of (profile_result.data ?? []) as admin_profile_row[]) {
      const uuid = string_value(raw.user_uuid)

      if (uuid) {
        internal_by_user.set(uuid, string_value(raw.internal_name))
      }
    }
  }

  for (const raw of (users_result.data ?? []) as unknown as users_embed_row[]) {
    const uuid = string_value(raw.user_uuid)

    if (!uuid) {
      continue
    }

    const label = build_operator_label(
      raw,
      internal_by_user.get(uuid) ?? null,
      policy,
    )

    if (label) {
      map.set(uuid, label)
    }
  }

  return map
}
