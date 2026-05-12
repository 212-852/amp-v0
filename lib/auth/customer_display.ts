import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Admin chat list: single resolver for customer card title + identity helpers.
 * Users / identities column lists come from `admin_chat_schema_column_list` RPC
 * (information_schema) when available; otherwise minimal safe selects.
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
  return (
    string_value(value.displayName) ??
    string_value(value.display_name) ??
    string_value(value.name)
  )
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

export const admin_chat_unset_customer_label = '未設定ユーザー'

export type admin_chat_schema_snapshot = {
  users_columns: string[]
  identities_columns: string[]
}

export type resolved_admin_chat_customer_source =
  | 'users.display_name'
  | 'identities.line_profile'
  | 'participants.display_name'
  | 'unset'

export type admin_chat_customer_participant_ref = {
  participant_uuid?: string | null
  display_name?: string | null
}

const USERS_SELECT_ALLOWLIST = [
  'user_uuid',
  'display_name',
  'role',
  'tier',
  'image_url',
  'locale',
] as const

let schema_snapshot_memo: admin_chat_schema_snapshot | null | undefined =
  undefined
let schema_snapshot_promise: Promise<admin_chat_schema_snapshot | null> | null =
  null

/**
 * Loads public.users / public.identities column names via RPC (migration).
 * Cached for the process. Returns null when RPC is missing or fails.
 */
export async function load_admin_chat_schema_snapshot(
  client: SupabaseClient,
): Promise<admin_chat_schema_snapshot | null> {
  if (schema_snapshot_memo !== undefined) {
    return schema_snapshot_memo
  }

  if (!schema_snapshot_promise) {
    schema_snapshot_promise = (async (): Promise<admin_chat_schema_snapshot | null> => {
      const { data, error } = await client.rpc('admin_chat_schema_column_list')

      if (
        error ||
        data === null ||
        data === undefined ||
        (typeof data !== 'object' && typeof data !== 'string')
      ) {
        schema_snapshot_memo = null
        return null
      }

      let parsed: unknown = data

      if (typeof data === 'string') {
        try {
          parsed = JSON.parse(data) as unknown
        } catch {
          schema_snapshot_memo = null
          return null
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        schema_snapshot_memo = null
        return null
      }

      const raw = parsed as Record<string, unknown>
      schema_snapshot_memo = {
        users_columns: normalize_column_list(raw.users_columns),
        identities_columns: normalize_column_list(raw.identities_columns),
      }

      return schema_snapshot_memo
    })()
  }

  return schema_snapshot_promise
}

function normalize_column_list(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.trim().length > 0,
  )
}

/**
 * Comma-separated SELECT list for `public.users` intersecting allowlist with
 * columns reported by the DB. Always includes `user_uuid` when that column exists.
 */
export function pick_users_select_list(
  snapshot: admin_chat_schema_snapshot | null,
): string {
  const allowed = new Set(snapshot?.users_columns ?? [])
  const picked: string[] = []

  for (const column of USERS_SELECT_ALLOWLIST) {
    if (allowed.has(column)) {
      picked.push(column)
    }
  }

  if (picked.includes('user_uuid')) {
    return picked.join(', ')
  }

  if (allowed.has('user_uuid')) {
    return ['user_uuid', ...picked.filter((c) => c !== 'user_uuid')].join(', ')
  }

  if (picked.length > 0) {
    return picked.join(', ')
  }

  return 'user_uuid'
}

export function resolve_admin_chat_customer_card_label(input: {
  user: Record<string, unknown> | null | undefined
  identity: identity_display_bundle | null | undefined
  customer: admin_chat_customer_participant_ref | null
}): { title: string; source: resolved_admin_chat_customer_source } {
  const user_display = string_value(
    typeof input.user?.['display_name'] === 'string'
      ? input.user['display_name']
      : null,
  )

  if (user_display) {
    return { title: user_display, source: 'users.display_name' }
  }

  const from_line_profile = string_value(
    input.identity?.line_profile_display_name,
  )

  if (from_line_profile) {
    return { title: from_line_profile, source: 'identities.line_profile' }
  }

  const from_participant = string_value(input.customer?.display_name)

  if (from_participant) {
    return { title: from_participant, source: 'participants.display_name' }
  }

  return { title: admin_chat_unset_customer_label, source: 'unset' }
}

