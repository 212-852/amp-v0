import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Admin chat list: users / identities column lists from RPC + users SELECT
 * builder. Customer title resolution lives in
 * `lib/chat/identity/admin_list_customer_name.ts`.
 */

export type admin_chat_schema_snapshot = {
  users_columns: string[]
  identities_columns: string[]
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
 * columns reported by the DB. When the RPC is not deployed, use `*` so PostgREST
 * returns only actual row columns instead of an invented column list.
 */
export function pick_users_select_list(
  snapshot: admin_chat_schema_snapshot | null,
): string {
  if (!snapshot) {
    return '*'
  }

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
