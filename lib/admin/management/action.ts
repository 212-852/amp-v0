import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

// ============================================================================
// Admin operator management core
// ----------------------------------------------------------------------------
// Reads admin user listings and per-admin detail used by the operator
// management pages (`/admin/management`). All callers must already be gated
// by `lib/admin/management/context.ts`.
// ============================================================================

export type admin_user_summary = {
  user_uuid: string
  display_name: string | null
  role: string | null
  tier: string | null
  image_url: string | null
  created_at: string | null
  reception_state: 'open' | 'offline' | null
  reception_updated_at: string | null
}

export type admin_user_identity = {
  provider: string
  provider_id: string | null
}

export type admin_user_detail = admin_user_summary & {
  identities: admin_user_identity[]
}

type users_row = Record<string, unknown>
type receptions_row = Record<string, unknown>
type identities_row = Record<string, unknown>

function string_value(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function pick_reception_state(value: unknown): 'open' | 'offline' | null {
  return value === 'open' || value === 'offline' ? value : null
}

function row_user_uuid(row: users_row | identities_row | receptions_row): string | null {
  const raw = row['user_uuid']
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

async function fetch_receptions_by_user(
  user_uuids: string[],
): Promise<Map<string, { state: 'open' | 'offline' | null; updated_at: string | null }>> {
  const map = new Map<string, { state: 'open' | 'offline' | null; updated_at: string | null }>()

  if (user_uuids.length === 0) {
    return map
  }

  const result = await supabase
    .from('receptions')
    .select('user_uuid, state, updated_at')
    .in('user_uuid', user_uuids)

  if (result.error) {
    return map
  }

  for (const raw of (result.data ?? []) as receptions_row[]) {
    const uuid = row_user_uuid(raw)

    if (!uuid) {
      continue
    }

    map.set(uuid, {
      state: pick_reception_state(raw['state']),
      updated_at: string_value(raw['updated_at']),
    })
  }

  return map
}

async function fetch_identities_by_user(
  user_uuid: string,
): Promise<admin_user_identity[]> {
  const result = await supabase
    .from('identities')
    .select('provider, provider_id')
    .eq('user_uuid', user_uuid)

  if (result.error) {
    return []
  }

  const rows = (result.data ?? []) as identities_row[]

  return rows
    .map((row): admin_user_identity | null => {
      const provider = string_value(row['provider'])

      if (!provider) {
        return null
      }

      return {
        provider,
        provider_id: string_value(row['provider_id']),
      }
    })
    .filter((value): value is admin_user_identity => value !== null)
}

function row_to_summary(
  row: users_row,
  receptions: Map<string, { state: 'open' | 'offline' | null; updated_at: string | null }>,
): admin_user_summary | null {
  const user_uuid = row_user_uuid(row)

  if (!user_uuid) {
    return null
  }

  const reception = receptions.get(user_uuid) ?? null

  return {
    user_uuid,
    display_name: string_value(row['display_name']),
    role: string_value(row['role']),
    tier: string_value(row['tier']),
    image_url: string_value(row['image_url']),
    created_at: string_value(row['created_at']),
    reception_state: reception?.state ?? null,
    reception_updated_at: reception?.updated_at ?? null,
  }
}

/**
 * List every user with admin role. Reception state is enriched best-effort:
 * if the receptions read fails, summaries still render with `null` state.
 */
export async function list_admin_users(): Promise<admin_user_summary[]> {
  const result = await supabase
    .from('users')
    .select('*')
    .eq('role', 'admin')

  if (result.error) {
    throw result.error
  }

  const rows = (result.data ?? []) as users_row[]
  const user_uuids = rows
    .map((row) => row_user_uuid(row))
    .filter((value): value is string => value !== null)
  const receptions = await fetch_receptions_by_user(user_uuids)

  const summaries = rows
    .map((row) => row_to_summary(row, receptions))
    .filter((value): value is admin_user_summary => value !== null)

  return summaries.sort((a, b) => {
    const left = a.display_name ?? a.user_uuid
    const right = b.display_name ?? b.user_uuid
    return left.localeCompare(right, 'ja')
  })
}

/**
 * Read a single admin user with identities. Returns `null` when the user
 * does not exist or is not an admin.
 */
export async function read_admin_user(
  user_uuid: string,
): Promise<admin_user_detail | null> {
  const sanitized = clean_uuid(user_uuid)

  if (!sanitized) {
    return null
  }

  const result = await supabase
    .from('users')
    .select('*')
    .eq('user_uuid', sanitized)
    .eq('role', 'admin')
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const row = result.data as users_row | null

  if (!row) {
    return null
  }

  const receptions = await fetch_receptions_by_user([sanitized])
  const summary = row_to_summary(row, receptions)

  if (!summary) {
    return null
  }

  const identities = await fetch_identities_by_user(sanitized)

  return {
    ...summary,
    identities,
  }
}
