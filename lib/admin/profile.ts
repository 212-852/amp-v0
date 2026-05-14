import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import {
  fetch_user_profile_json,
  fetch_users_profile_json_map,
} from '@/lib/users/profile_json'

/**
 * Single core for operator-facing labels from `users.profile_json` + `users`.
 * Uses `profile_json.internal_name` only (never real_name / birth_date for display policy paths that require it).
 */

export type admin_operator_display_policy =
  | 'memo_snapshot'
  | 'memo_list'
  | 'admin_display'

type users_embed_row = {
  user_uuid: string
  display_name: string | null
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

/**
 * Handoff memo display: internal_name, display_name, email local, Admin.
 * Does not use users.name or real_name.
 */
function compose_handoff_saved_by_label(input: {
  internal_name: string | null
  display_name: string | null
  email: string | null
}): string {
  if (input.internal_name) {
    return input.internal_name
  }

  if (input.display_name) {
    return input.display_name
  }

  const local = email_local_part(input.email)

  if (local) {
    return local
  }

  return 'Admin'
}

function compose_admin_display_label(input: {
  internal_name: string | null
  display_name: string | null
}): string | null {
  if (input.internal_name) {
    return input.internal_name
  }

  if (input.display_name) {
    return input.display_name
  }

  return null
}

/**
 * One saved_by snapshot for handoff memo insert (`users.profile_json.internal_name` first).
 */
export async function resolve_handoff_memo_saved_by_name(
  user_uuid_raw: string | null | undefined,
): Promise<string> {
  const user_uuid = clean_uuid(user_uuid_raw)

  if (!user_uuid) {
    return 'Admin'
  }

  const profile = await fetch_user_profile_json(user_uuid)
  const internal = string_value(profile.internal_name ?? null)

  if (internal) {
    return internal
  }

  const user_result = await supabase
    .from('users')
    .select('display_name')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (user_result.error || !user_result.data) {
    return 'Admin'
  }

  const row = user_result.data as { display_name?: unknown }

  return compose_handoff_saved_by_label({
    internal_name: null,
    display_name: string_value(row.display_name),
    email: null,
  })
}

/**
 * Batch resolve for list views: reads `users.profile_json.internal_name` and
 * falls back to `users.display_name`. Map keys are lower-case UUIDs (see `clean_uuid`).
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

  const profile_map = await fetch_users_profile_json_map(cleaned)
  const internal_by_user = new Map<string, string | null>()

  for (const uuid of cleaned) {
    internal_by_user.set(
      uuid,
      string_value(profile_map.get(uuid)?.internal_name ?? null),
    )
  }

  const users_result = await supabase
    .from('users')
    .select('user_uuid, display_name')
    .in('user_uuid', cleaned)

  if (users_result.error) {
    return map
  }

  for (const raw of (users_result.data ?? []) as unknown as users_embed_row[]) {
    const uuid = clean_uuid(raw.user_uuid)

    if (!uuid) {
      continue
    }

    const internal = internal_by_user.get(uuid) ?? null

    let label: string | null = null

    if (policy === 'admin_display') {
      label =
        compose_admin_display_label({
          internal_name: internal,
          display_name: string_value(raw.display_name),
        }) ?? null
    } else {
      label = compose_handoff_saved_by_label({
        internal_name: internal,
        display_name: string_value(raw.display_name),
        email: null,
      })
    }

    if (label) {
      map.set(uuid, label)
    }
  }

  return map
}
