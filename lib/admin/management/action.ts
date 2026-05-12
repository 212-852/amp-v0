import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { notify } from '@/lib/notify'
import {
  can_update_admin_profile,
  validate_admin_profile_input,
  type admin_profile_input,
} from './rules'

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
  fallback_name: string | null
  role: string | null
  tier: string | null
  image_url: string | null
  created_at: string | null
  reception_state: 'open' | 'offline' | null
  reception_updated_at: string | null
  profile: admin_profile
}

export type admin_profile = {
  real_name: string | null
  birth_date: string | null
  work_name: string | null
  updated_at: string | null
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
type admin_profiles_row = Record<string, unknown>

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

async function fetch_admin_profiles_by_user(
  user_uuids: string[],
): Promise<Map<string, admin_profile>> {
  const map = new Map<string, admin_profile>()

  if (user_uuids.length === 0) {
    return map
  }

  const result = await supabase
    .from('admin_profiles')
    .select('user_uuid, real_name, birth_date, work_name, updated_at')
    .in('user_uuid', user_uuids)

  if (result.error) {
    return map
  }

  for (const row of (result.data ?? []) as admin_profiles_row[]) {
    const user_uuid = row_user_uuid(row)

    if (!user_uuid) {
      continue
    }

    map.set(user_uuid, {
      real_name: string_value(row['real_name']),
      birth_date: string_value(row['birth_date']),
      work_name: string_value(row['work_name']),
      updated_at: string_value(row['updated_at']),
    })
  }

  return map
}

function empty_profile(): admin_profile {
  return {
    real_name: null,
    birth_date: null,
    work_name: null,
    updated_at: null,
  }
}

function fallback_user_name(row: users_row): string | null {
  return (
    string_value(row['display_name']) ??
    string_value(row['name']) ??
    string_value(row['email'])
  )
}

function row_to_summary(
  row: users_row,
  receptions: Map<string, { state: 'open' | 'offline' | null; updated_at: string | null }>,
  profiles: Map<string, admin_profile>,
): admin_user_summary | null {
  const user_uuid = row_user_uuid(row)

  if (!user_uuid) {
    return null
  }

  const reception = receptions.get(user_uuid) ?? null
  const profile = profiles.get(user_uuid) ?? empty_profile()
  const fallback_name = fallback_user_name(row)

  return {
    user_uuid,
    display_name: profile.work_name ?? fallback_name,
    fallback_name,
    role: string_value(row['role']),
    tier: string_value(row['tier']),
    image_url: string_value(row['image_url']),
    created_at: string_value(row['created_at']),
    reception_state: reception?.state ?? null,
    reception_updated_at: reception?.updated_at ?? null,
    profile,
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
  const [receptions, profiles] = await Promise.all([
    fetch_receptions_by_user(user_uuids),
    fetch_admin_profiles_by_user(user_uuids),
  ])

  const summaries = rows
    .map((row) => row_to_summary(row, receptions, profiles))
    .filter((value): value is admin_user_summary => value !== null)

  return summaries.sort((a, b) => {
    const left = a.display_name ?? a.fallback_name ?? a.user_uuid
    const right = b.display_name ?? b.fallback_name ?? b.user_uuid
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

  const [receptions, profiles] = await Promise.all([
    fetch_receptions_by_user([sanitized]),
    fetch_admin_profiles_by_user([sanitized]),
  ])
  const summary = row_to_summary(row, receptions, profiles)

  if (!summary) {
    return null
  }

  const identities = await fetch_identities_by_user(sanitized)

  return {
    ...summary,
    identities,
  }
}

export type update_admin_profile_result =
  | {
      ok: true
      profile: admin_profile
    }
  | {
      ok: false
      error:
        | 'invalid_user'
        | 'admin_not_found'
        | 'not_allowed'
        | 'real_name_too_long'
        | 'work_name_too_long'
        | 'invalid_birth_date'
    }

export async function update_admin_profile(input: {
  user_uuid: string
  updated_by_user_uuid: string
  updated_by_role: string | null
  updated_by_tier: string | null
  source_channel?: string | null
} & admin_profile_input): Promise<update_admin_profile_result> {
  const user_uuid = clean_uuid(input.user_uuid)
  const updated_by_user_uuid = clean_uuid(input.updated_by_user_uuid)

  if (!user_uuid) {
    return { ok: false, error: 'invalid_user' }
  }

  if (
    !updated_by_user_uuid ||
    !can_update_admin_profile({
      role: input.updated_by_role,
      tier: input.updated_by_tier,
    })
  ) {
    return { ok: false, error: 'not_allowed' }
  }

  const validation = validate_admin_profile_input(input)

  if (!validation.ok) {
    return validation
  }

  const user_result = await supabase
    .from('users')
    .select('user_uuid')
    .eq('user_uuid', user_uuid)
    .eq('role', 'admin')
    .maybeSingle()

  if (user_result.error) {
    throw user_result.error
  }

  if (!user_result.data) {
    return { ok: false, error: 'admin_not_found' }
  }

  const current_profile_result = await supabase
    .from('admin_profiles')
    .select('work_name')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (current_profile_result.error) {
    throw current_profile_result.error
  }

  const old_work_name = string_value(
    (current_profile_result.data as admin_profiles_row | null)?.['work_name'],
  )

  const updated_at = new Date().toISOString()
  const result = await supabase
    .from('admin_profiles')
    .upsert({
      user_uuid,
      real_name: validation.value.real_name,
      birth_date: validation.value.birth_date,
      work_name: validation.value.work_name,
      updated_at,
    })
    .select('real_name, birth_date, work_name, updated_at')
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const row = (result.data ?? {}) as admin_profiles_row
  const next_work_name = string_value(row['work_name'])

  if (next_work_name && next_work_name !== old_work_name) {
    await notify({
      event: 'admin_internal_name_updated',
      admin_user_uuid: user_uuid,
      old_internal_name: old_work_name,
      new_internal_name: next_work_name,
      updated_by_user_uuid,
      updated_at,
      source_channel: input.source_channel ?? 'web',
    })
  }

  return {
    ok: true,
    profile: {
      real_name: string_value(row['real_name']),
      birth_date: string_value(row['birth_date']),
      work_name: string_value(row['work_name']),
      updated_at: string_value(row['updated_at']) ?? updated_at,
    },
  }
}

export async function read_admin_display_name(
  user_uuid: string | null | undefined,
): Promise<string | null> {
  const sanitized = clean_uuid(user_uuid)

  if (!sanitized) {
    return null
  }

  const profile_result = await supabase
    .from('admin_profiles')
    .select('work_name')
    .eq('user_uuid', sanitized)
    .maybeSingle()

  if (!profile_result.error) {
    const work_name = string_value(
      (profile_result.data as admin_profiles_row | null)?.['work_name'],
    )

    if (work_name) {
      return work_name
    }
  }

  const user_result = await supabase
    .from('users')
    .select('*')
    .eq('user_uuid', sanitized)
    .maybeSingle()

  if (user_result.error) {
    throw user_result.error
  }

  return user_result.data ? fallback_user_name(user_result.data as users_row) : null
}
