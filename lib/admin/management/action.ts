import 'server-only'

import { batch_resolve_admin_operator_display } from '@/lib/admin/profile'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'
import { deliver_admin_internal_name_updated } from '@/lib/notify'
import {
  can_update_profile,
  validate_profile_input,
  type profile_input,
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
  is_available: boolean
  profile: profile
}

export type profile = {
  real_name: string | null
  birth_date: string | null
  display_name: string | null
  /** UI-facing internal display name. Stored as profiles.internal_name. */
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
type availability_row = Record<string, unknown>
type identities_row = Record<string, unknown>
type profiles_row = Record<string, unknown>

function string_value(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function row_user_uuid(
  row: users_row | identities_row | availability_row | profiles_row,
): string | null {
  const raw = row['user_uuid']
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

function row_admin_user_uuid(row: availability_row): string | null {
  const raw = row['admin_user_uuid']
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

async function fetch_availability_by_user(
  user_uuids: string[],
): Promise<Map<string, { is_available: boolean; updated_at: string | null }>> {
  const map = new Map<string, { is_available: boolean; updated_at: string | null }>()

  if (user_uuids.length === 0) {
    return map
  }

  const result = await supabase
    .from('admin_availability')
    .select('admin_user_uuid, is_available, updated_at')
    .in('admin_user_uuid', user_uuids)

  if (result.error) {
    return map
  }

  for (const raw of (result.data ?? []) as availability_row[]) {
    const uuid = row_admin_user_uuid(raw)

    if (!uuid) {
      continue
    }

    map.set(uuid, {
      is_available: raw['is_available'] === true,
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
    .neq('provider', 'line_oauth_pending')

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

async function fetch_profiles_by_user(
  user_uuids: string[],
): Promise<Map<string, profile>> {
  const map = new Map<string, profile>()

  if (user_uuids.length === 0) {
    return map
  }

  await debug_event({
    category: 'admin_management',
    event: 'profile_fetch_started',
    payload: {
      user_count: user_uuids.length,
      source_channel: 'web',
      error_code: null,
      error_message: null,
      error_details: null,
      error_hint: null,
    },
  })

  const result = await supabase
    .from('profiles')
    .select('user_uuid, real_name, birth_date, internal_name, display_name, updated_at')
    .in('user_uuid', user_uuids)

  if (result.error) {
    throw result.error
  }

  for (const raw of (result.data ?? []) as profiles_row[]) {
    const uuid = row_user_uuid(raw)

    if (!uuid) {
      continue
    }

    map.set(uuid, {
      real_name: string_value(raw['real_name']),
      birth_date: string_value(raw['birth_date']),
      display_name: string_value(raw['display_name']),
      work_name: string_value(raw['internal_name']),
      updated_at: string_value(raw['updated_at']),
    })
  }

  await debug_event({
    category: 'admin_management',
    event: 'profile_fetch_succeeded',
    payload: {
      user_count: user_uuids.length,
      profile_count: map.size,
      source_channel: 'web',
      error_code: null,
      error_message: null,
      error_details: null,
      error_hint: null,
    },
  })

  return map
}

function empty_profile(): profile {
  return {
    real_name: null,
    birth_date: null,
    display_name: null,
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
  availability: Map<string, { is_available: boolean; updated_at: string | null }>,
  profiles: Map<string, profile>,
): admin_user_summary | null {
  const user_uuid = row_user_uuid(row)

  if (!user_uuid) {
    return null
  }

  const available = availability.get(user_uuid) ?? null
  const profile = profiles.get(user_uuid) ?? empty_profile()
  const fallback_name = fallback_user_name(row)

  return {
    user_uuid,
    display_name: profile.display_name ?? profile.work_name ?? fallback_name,
    fallback_name,
    role: string_value(row['role']),
    tier: string_value(row['tier']),
    image_url: string_value(row['image_url']),
    created_at: string_value(row['created_at']),
    reception_state: available?.is_available
      ? 'open'
      : available
        ? 'offline'
        : null,
    reception_updated_at: available?.updated_at ?? null,
    is_available: available?.is_available ?? false,
    profile,
  }
}

/**
 * List every user with admin role. Availability state is enriched best-effort:
 * if the availability read fails, summaries still render as unavailable.
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
  const [availability, profiles] = await Promise.all([
    fetch_availability_by_user(user_uuids),
    fetch_profiles_by_user(user_uuids),
  ])

  const summaries = rows
    .map((row) => row_to_summary(row, availability, profiles))
    .filter((value): value is admin_user_summary => value !== null)

  return summaries.sort((a, b) => {
    const left = a.display_name ?? a.fallback_name ?? a.user_uuid
    const right = b.display_name ?? b.fallback_name ?? b.user_uuid
    return left.localeCompare(right, 'ja')
  })
}

export async function list_available_admin_users(): Promise<admin_user_summary[]> {
  const admins = await list_admin_users()

  return admins
    .filter((admin) => admin.is_available)
    .sort((a, b) => {
      const left = new Date(a.reception_updated_at ?? 0).getTime()
      const right = new Date(b.reception_updated_at ?? 0).getTime()
      return right - left
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

  const [availability, profiles] = await Promise.all([
    fetch_availability_by_user([sanitized]),
    fetch_profiles_by_user([sanitized]),
  ])
  const summary = row_to_summary(row, availability, profiles)

  if (!summary) {
    return null
  }

  const identities = await fetch_identities_by_user(sanitized)

  return {
    ...summary,
    identities,
  }
}

export type update_profile_result =
  | {
      ok: true
      profile: profile
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
        | 'persist_failed'
        | 'target_load_failed'
      error_message?: string
      error_details?: string | null
      error_hint?: string | null
    }

/**
 * Admin operator profile fields live in `public.profiles`.
 * Writes use the service-role client.
 */
type profile_debug_row = {
  target_user_uuid: string
  auth_user_uuid: string
  updated_by_user_uuid: string
  role: string | null
  tier: string | null
  source_channel: string
  changed_fields: string[]
  phase: string
  error_code: string | null
  error_message: string | null
  error_details: string | null
  error_hint: string | null
}

function compute_changed_field_names(input: {
  before: {
    real_name: string | null
    birth_date: string | null
    work_name: string | null
  }
  after: {
    real_name: string | null
    birth_date: string | null
    work_name: string | null
  }
}): string[] {
  const changed_fields: string[] = []

  if (input.before.work_name !== input.after.work_name) {
    changed_fields.push('internal_name')
  }

  if (
    input.before.real_name !== input.after.real_name ||
    input.before.birth_date !== input.after.birth_date
  ) {
    changed_fields.push('private_profile_fields')
  }

  return changed_fields
}

function serialize_service_error(error: unknown): {
  error_code: string
  error_message: string
  error_details: string | null
  error_hint: string | null
} {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    const message = typeof e.message === 'string' ? e.message : null

    if (message) {
      const code = typeof e.code === 'string' ? e.code : 'postgrest_error'
      const details = typeof e.details === 'string' ? e.details : null
      const hint = typeof e.hint === 'string' ? e.hint : null

      return {
        error_code: code,
        error_message: message,
        error_details: details,
        error_hint: hint ?? hint_for_postgrest_code(code),
      }
    }
  }

  if (error instanceof Error) {
    return {
      error_code: 'exception',
      error_message: error.message,
      error_details: null,
      error_hint: null,
    }
  }

  return {
    error_code: 'unknown',
    error_message: String(error),
    error_details: null,
    error_hint: null,
  }
}

function hint_for_postgrest_code(code: string): string | null {
  if (code === 'PGRST204') {
    return 'column_missing_or_rpc_schema_mismatch'
  }

  if (code === 'PGRST205') {
    return 'table_missing_or_schema_cache_stale'
  }

  if (code === '23503') {
    return 'foreign_key_violation'
  }

  return null
}

function empty_debug_errors(): Pick<
  profile_debug_row,
  'error_code' | 'error_message' | 'error_details' | 'error_hint'
> {
  return {
    error_code: null,
    error_message: null,
    error_details: null,
    error_hint: null,
  }
}

function profile_form_debug_extra(
  input: profile_input,
): Record<string, unknown> {
  const rn = String(input.real_name ?? '').trim()
  const bd = String(input.birth_date ?? '').trim()
  const wn = String(input.work_name ?? '').trim()

  return {
    real_name_exists: rn.length > 0,
    birth_date_exists: bd.length > 0,
    internal_name_exists: wn.length > 0,
    internal_name_length: wn.length,
  }
}

async function emit_admin_management_debug(input: {
  event:
    | 'profile_fetch_started'
    | 'profile_fetch_succeeded'
    | 'profile_save_clicked'
    | 'profile_save_payload_built'
    | 'profile_save_started'
    | 'profile_save_failed'
    | 'profile_save_succeeded'
    | 'admin_internal_name_notify_failed'
    | 'admin_internal_name_notify_succeeded'
  base: profile_debug_row
  extra?: Record<string, unknown>
}) {
  await debug_event({
    category: 'admin_management',
    event: input.event,
    payload: {
      ...input.base,
      ...(input.extra ?? {}),
    },
  })
}

export async function update_profile(input: {
  user_uuid: string
  updated_by_user_uuid: string
  updated_by_role: string | null
  updated_by_tier: string | null
  source_channel?: string | null
} & profile_input): Promise<update_profile_result> {
  const user_uuid = clean_uuid(input.user_uuid)
  const updated_by_user_uuid = clean_uuid(input.updated_by_user_uuid)
  const source_channel = input.source_channel ?? 'web'

  const base_debug = (
    partial: Pick<
      profile_debug_row,
      'phase' | 'changed_fields'
    > &
      Partial<
        Pick<
          profile_debug_row,
          | 'target_user_uuid'
          | 'updated_by_user_uuid'
          | 'role'
          | 'tier'
          | 'source_channel'
        >
      >,
  ): profile_debug_row => ({
    target_user_uuid: partial.target_user_uuid ?? user_uuid ?? '',
    auth_user_uuid:
      partial.updated_by_user_uuid ?? updated_by_user_uuid ?? '',
    updated_by_user_uuid:
      partial.updated_by_user_uuid ?? updated_by_user_uuid ?? '',
    role: partial.role ?? input.updated_by_role ?? null,
    tier: partial.tier ?? input.updated_by_tier ?? null,
    source_channel: partial.source_channel ?? source_channel,
    changed_fields: partial.changed_fields,
    phase: partial.phase,
    ...empty_debug_errors(),
  })

  if (!user_uuid) {
    await emit_admin_management_debug({
      event: 'profile_save_failed',
      base: {
        ...base_debug({
          phase: 'ingress',
          changed_fields: [],
        }),
        target_user_uuid: '',
        updated_by_user_uuid: updated_by_user_uuid ?? '',
        error_code: 'invalid_user',
        error_message: 'invalid_target_uuid',
        error_details: null,
        error_hint: 'check_url_uuid',
      },
      extra: profile_form_debug_extra(input),
    })

    return { ok: false, error: 'invalid_user' }
  }

  await emit_admin_management_debug({
    event: 'profile_save_clicked',
    base: base_debug({
      phase: 'clicked',
      changed_fields: [],
    }),
    extra: profile_form_debug_extra(input),
  })

  if (
    !updated_by_user_uuid ||
    !can_update_profile({
      role: input.updated_by_role,
      tier: input.updated_by_tier,
    })
  ) {
    await emit_admin_management_debug({
      event: 'profile_save_failed',
      base: {
        ...base_debug({
          phase: 'gate',
          changed_fields: [],
        }),
        error_code: 'not_allowed',
        error_message: 'caller_not_owner_or_core',
        error_details: null,
        error_hint: 'check_session_tier',
      },
      extra: profile_form_debug_extra(input),
    })

    return { ok: false, error: 'not_allowed' }
  }

  const validation = validate_profile_input(input)

  if (!validation.ok) {
    await emit_admin_management_debug({
      event: 'profile_save_failed',
      base: {
        ...base_debug({
          phase: 'validate_input',
          changed_fields: [],
        }),
        error_code: validation.error,
        error_message: validation.error,
        error_details: null,
        error_hint: 'fix_form_input',
      },
      extra: profile_form_debug_extra(input),
    })

    return validation
  }

  const user_result = await supabase
    .from('users')
    .select('user_uuid')
    .eq('user_uuid', user_uuid)
    .eq('role', 'admin')
    .maybeSingle()

  if (user_result.error) {
    const serialized = serialize_service_error(user_result.error)

    await emit_admin_management_debug({
      event: 'profile_save_failed',
      base: {
        ...base_debug({
          phase: 'validate_target',
          changed_fields: [],
        }),
        ...serialized,
      },
      extra: profile_form_debug_extra(input),
    })

    return {
      ok: false,
      error: 'target_load_failed',
      error_message: serialized.error_message,
      error_details: serialized.error_details,
      error_hint: serialized.error_hint,
    }
  }

  if (!user_result.data) {
    await emit_admin_management_debug({
      event: 'profile_save_failed',
      base: {
        ...base_debug({
          phase: 'validate_target',
          changed_fields: [],
        }),
        error_code: 'admin_not_found',
        error_message: 'target_user_not_admin_or_missing',
        error_details: null,
        error_hint: 'check_user_uuid',
      },
      extra: profile_form_debug_extra(input),
    })

    return { ok: false, error: 'admin_not_found' }
  }

  await emit_admin_management_debug({
    event: 'profile_fetch_started',
    base: base_debug({
      phase: 'fetch_current',
      changed_fields: [],
    }),
    extra: profile_form_debug_extra(input),
  })

  const current_profile_result = await supabase
    .from('profiles')
    .select('real_name, birth_date, internal_name, updated_at')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (current_profile_result.error) {
    const serialized = serialize_service_error(current_profile_result.error)

    await emit_admin_management_debug({
      event: 'profile_save_failed',
      base: {
        ...base_debug({
          phase: 'fetch_current',
          changed_fields: [],
        }),
        ...serialized,
      },
      extra: profile_form_debug_extra(input),
    })

    return {
      ok: false,
      error: 'target_load_failed',
      error_message: serialized.error_message,
      error_details: serialized.error_details,
      error_hint: serialized.error_hint,
    }
  }

  const current_profile = (current_profile_result.data ?? {}) as profiles_row

  const before = {
    real_name: string_value(current_profile['real_name']),
    birth_date: string_value(current_profile['birth_date']),
    work_name: string_value(current_profile['internal_name']),
  }

  const changed_fields = compute_changed_field_names({
    before,
    after: validation.value,
  })

  await emit_admin_management_debug({
    event: 'profile_fetch_succeeded',
    base: base_debug({
      phase: 'fetch_current_complete',
      changed_fields,
    }),
    extra: {
      ...profile_form_debug_extra(input),
      persist_table: 'profiles',
      persist_columns: ['real_name', 'birth_date', 'internal_name', 'updated_at'],
      persist_update_key_column: 'user_uuid',
      target_user_uuid_matches_update_key: true,
      db_client: 'supabase_service_role',
      rls_effect: 'service_role_bypasses_rls',
    },
  })

  await emit_admin_management_debug({
    event: 'profile_save_payload_built',
    base: base_debug({
      phase: 'payload_built',
      changed_fields,
    }),
    extra: {
      ...profile_form_debug_extra(input),
      persist_table: 'profiles',
      persist_columns: ['user_uuid', 'real_name', 'birth_date', 'internal_name', 'updated_at'],
      persist_update_key_column: 'user_uuid',
    },
  })

  await emit_admin_management_debug({
    event: 'profile_save_started',
    base: base_debug({
      phase: 'persist',
      changed_fields,
    }),
    extra: profile_form_debug_extra(input),
  })

  const old_work_name = before.work_name
  const updated_at = new Date().toISOString()

  const upsert_result = await supabase
    .from('profiles')
    .upsert(
      {
        user_uuid,
        real_name: validation.value.real_name,
        birth_date: validation.value.birth_date,
        internal_name: validation.value.work_name,
        updated_at,
      },
      { onConflict: 'user_uuid' },
    )
    .select('real_name, birth_date, internal_name, updated_at')
    .maybeSingle()

  if (upsert_result.error) {
    const serialized = serialize_service_error(upsert_result.error)

    await emit_admin_management_debug({
      event: 'profile_save_failed',
      base: {
        ...base_debug({
          phase: 'persist',
          changed_fields,
        }),
        ...serialized,
      },
      extra: profile_form_debug_extra(input),
    })

    return {
      ok: false,
      error: 'persist_failed',
      error_message: serialized.error_message,
      error_details: serialized.error_details,
      error_hint: serialized.error_hint,
    }
  }

  const saved_profile = (upsert_result.data ?? {}) as profiles_row
  const next_work_name = string_value(validation.value.work_name)
  const profile: profile = {
    real_name: string_value(saved_profile['real_name']),
    birth_date: string_value(saved_profile['birth_date']),
    display_name: null,
    work_name: next_work_name,
    updated_at: string_value(saved_profile['updated_at']) ?? updated_at,
  }

  await emit_admin_management_debug({
    event: 'profile_save_succeeded',
    base: base_debug({
      phase: 'persist_complete',
      changed_fields,
    }),
    extra: profile_form_debug_extra(input),
  })

  if (next_work_name && next_work_name !== old_work_name) {
    const notify_payload = {
      event: 'admin_internal_name_updated' as const,
      admin_user_uuid: user_uuid,
      old_internal_name: old_work_name,
      new_internal_name: next_work_name,
      updated_by_user_uuid,
      updated_at,
      source_channel,
    }

    const notify_outcome =
      await deliver_admin_internal_name_updated(notify_payload)

    if (notify_outcome.ok) {
      await emit_admin_management_debug({
        event: 'admin_internal_name_notify_succeeded',
        base: base_debug({
          phase: notify_outcome.skipped ? 'notify_skipped' : 'notify_delivered',
          changed_fields: ['internal_name'],
        }),
        extra: {
          old_internal_name: old_work_name,
          new_internal_name: next_work_name,
          notify_skipped: notify_outcome.skipped,
        },
      })
    } else {
      await emit_admin_management_debug({
        event: 'admin_internal_name_notify_failed',
        base: {
          ...base_debug({
            phase: 'notify',
            changed_fields: ['internal_name'],
          }),
          error_code: 'notify_delivery_failed',
          error_message: notify_outcome.error_message,
          error_details: notify_outcome.error_details,
          error_hint: 'profile_saved_check_discord_webhook',
        },
        extra: {
          old_internal_name: old_work_name,
          new_internal_name: next_work_name,
        },
      })
    }
  }

  return {
    ok: true,
    profile,
  }
}

export async function read_admin_display_name(
  user_uuid: string | null | undefined,
): Promise<string | null> {
  const sanitized = clean_uuid(user_uuid)

  if (!sanitized) {
    return null
  }

  const label_map = await batch_resolve_admin_operator_display(
    [sanitized],
    'admin_display',
  )
  const resolved = label_map.get(sanitized)

  if (resolved) {
    return resolved
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
