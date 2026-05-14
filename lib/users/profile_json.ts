import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

export type user_profile_json = {
  real_name?: string | null
  birth_date?: string | null
  internal_name?: string | null
  avatar_url?: string | null
  locale?: string | null
}

function string_value(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function parse_profile_json(raw: unknown): user_profile_json {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  const record = raw as Record<string, unknown>

  return {
    real_name: string_value(record.real_name),
    birth_date: string_value(record.birth_date),
    internal_name: string_value(record.internal_name),
    avatar_url: string_value(record.avatar_url),
    locale: string_value(record.locale),
  }
}

export async function fetch_users_profile_json_map(
  user_uuids: string[],
): Promise<Map<string, user_profile_json>> {
  const map = new Map<string, user_profile_json>()

  if (user_uuids.length === 0) {
    return map
  }

  const result = await supabase
    .from('users')
    .select('user_uuid, profile_json')
    .in('user_uuid', user_uuids)

  if (result.error) {
    return map
  }

  for (const row of result.data ?? []) {
    const uuid = clean_uuid((row as { user_uuid?: unknown }).user_uuid)

    if (!uuid) {
      continue
    }

    map.set(uuid, parse_profile_json((row as { profile_json?: unknown }).profile_json))
  }

  return map
}

export async function fetch_user_profile_json(
  user_uuid_raw: string | null | undefined,
): Promise<user_profile_json> {
  const user_uuid = clean_uuid(user_uuid_raw)

  if (!user_uuid) {
    return {}
  }

  const map = await fetch_users_profile_json_map([user_uuid])

  return map.get(user_uuid) ?? {}
}

export async function merge_user_profile_json(input: {
  user_uuid: string
  patch: user_profile_json
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const user_uuid = clean_uuid(input.user_uuid)

  if (!user_uuid) {
    return { ok: false, error: new Error('invalid_user_uuid') }
  }

  const current = await supabase
    .from('users')
    .select('profile_json')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (current.error) {
    return { ok: false, error: current.error }
  }

  const base = parse_profile_json(current.data?.profile_json)
  const next = {
    ...base,
    ...Object.fromEntries(
      Object.entries(input.patch).filter(([, v]) => v !== undefined),
    ),
  }

  const updated = await supabase
    .from('users')
    .update({
      profile_json: next,
      updated_at: new Date().toISOString(),
    })
    .eq('user_uuid', user_uuid)
    .select('profile_json')
    .maybeSingle()

  if (updated.error) {
    return { ok: false, error: updated.error }
  }

  return { ok: true }
}
