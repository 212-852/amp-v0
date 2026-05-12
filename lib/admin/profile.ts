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
  admin_profiles:
    | { internal_name: string | null }
    | { internal_name: string | null }[]
    | null
}

function string_value(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function pick_internal_name_from_profile(raw: unknown): string | null {
  if (!raw) {
    return null
  }

  if (Array.isArray(raw)) {
    return string_value(raw[0]?.internal_name)
  }

  if (typeof raw === 'object' && raw !== null && 'internal_name' in raw) {
    return string_value((raw as { internal_name?: unknown }).internal_name)
  }

  return null
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
  policy: admin_operator_display_policy,
): string | null {
  const internal = pick_internal_name_from_profile(row.admin_profiles)

  if (internal) {
    return internal
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

  if (policy === 'memo_list') {
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
 * One query: `users` with embedded `admin_profiles(internal_name)`.
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

  const result = await supabase
    .from('users')
    .select('user_uuid, display_name, name, email, admin_profiles(internal_name)')
    .in('user_uuid', cleaned)

  if (result.error) {
    return map
  }

  for (const raw of (result.data ?? []) as unknown as users_embed_row[]) {
    const uuid = string_value(raw.user_uuid)

    if (!uuid) {
      continue
    }

    const label = build_operator_label(raw, policy)

    if (label) {
      map.set(uuid, label)
    }
  }

  return map
}
