import 'server-only'

import { load_admin_chat_schema_snapshot, pick_users_select_list } from '@/lib/auth/customer_display'
import {
  customer_display_name_fallback,
  emit_customer_display_name_resolved,
  resolve_customer_display_name,
  type resolve_customer_display_name_result,
  type resolved_customer_display_source,
} from '@/lib/chat/identity/customer_display_name'
import { supabase } from '@/lib/db/supabase'

export type customer_display_used_by = 'top' | 'list' | 'detail'

export type reception_customer_participant_row = {
  participant_uuid?: string | null
  room_uuid?: string | null
  user_uuid?: string | null
  visitor_uuid?: string | null
  role?: string | null
  display_name?: string | null
  nickname?: string | null
  label?: string | null
  is_active?: boolean | null
  is_typing?: boolean | null
  last_seen_at?: string | null
  typing_at?: string | null
  last_channel?: string | null
}

export type reception_customer_display_resolution = {
  display_name: string
  source: resolved_customer_display_source
  user_uuid: string | null
  visitor_uuid: string | null
  role: string | null
  tier: string | null
}

export type reception_customer_display_prefetch = {
  users_by_uuid: Map<string, Record<string, unknown>>
  profiles_by_uuid: Map<string, { display_name: string | null }>
  identity_rows_by_user: Map<string, Record<string, unknown>[]>
}

function pick_string(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function string_value(value: unknown): string | null {
  return pick_string(value)
}

export function choose_customer_user_participant(
  participants: reception_customer_participant_row[],
): reception_customer_participant_row | null {
  const user_rows = participants.filter((participant) => {
    const role = participant.role?.trim().toLowerCase() ?? ''
    return role === 'user'
  })

  return (
    user_rows.find((row) => string_value(row.user_uuid)) ?? user_rows[0] ?? null
  )
}

export async function fetch_reception_customer_display_prefetch(
  user_uuids: string[],
): Promise<reception_customer_display_prefetch> {
  const users_by_uuid = new Map<string, Record<string, unknown>>()
  const identity_rows_by_user = new Map<string, Record<string, unknown>[]>()
  const profiles_by_uuid = await fetch_customer_profiles_by_user(user_uuids)

  if (user_uuids.length === 0) {
    return {
      users_by_uuid,
      profiles_by_uuid,
      identity_rows_by_user,
    }
  }

  const schema_snapshot = await load_admin_chat_schema_snapshot(supabase)
  const users_select_list = pick_users_select_list(schema_snapshot)

  try {
    const user_result = await supabase
      .from('users')
      .select(users_select_list)
      .in('user_uuid', user_uuids)

    if (!user_result.error) {
      for (const user of (user_result.data ?? []) as unknown as Record<
        string,
        unknown
      >[]) {
        const uid = pick_string(user['user_uuid'])

        if (uid) {
          users_by_uuid.set(uid, user)
        }
      }
    }
  } catch {
    // keep partial maps
  }

  try {
    const identity_result = await supabase
      .from('identities')
      .select('*')
      .in('user_uuid', user_uuids)

    if (!identity_result.error) {
      for (const row of (identity_result.data ?? []) as Record<string, unknown>[]) {
        const uid = pick_string(row['user_uuid'])

        if (!uid) {
          continue
        }

        const list = identity_rows_by_user.get(uid) ?? []
        list.push(row)
        identity_rows_by_user.set(uid, list)
      }
    }
  } catch {
    // keep partial maps
  }

  await backfill_missing_users(user_uuids, users_by_uuid, users_select_list)

  return {
    users_by_uuid,
    profiles_by_uuid,
    identity_rows_by_user,
  }
}

export function resolve_reception_customer_display_from_prefetch(input: {
  room_uuid: string
  participants: reception_customer_participant_row[]
  prefetch: reception_customer_display_prefetch
}): {
  resolution: reception_customer_display_resolution
  result: resolve_customer_display_name_result
} {
  const customer = choose_customer_user_participant(input.participants)
  const customer_user_uuid = string_value(customer?.user_uuid ?? null)
  const visitor_uuid = string_value(customer?.visitor_uuid ?? null)
  const customer_user = customer_user_uuid
    ? input.prefetch.users_by_uuid.get(customer_user_uuid) ?? null
    : null
  const identity_rows_for_user = customer_user_uuid
    ? input.prefetch.identity_rows_by_user.get(customer_user_uuid) ?? []
    : []

  const result = customer_user_uuid
    ? resolve_customer_display_name({
        profile: input.prefetch.profiles_by_uuid.get(customer_user_uuid) ?? null,
        user: customer_user,
        identity_rows: identity_rows_for_user,
      })
    : {
        display_name: customer_display_name_fallback,
        source: 'fallback' as const,
        debug: {
          has_profile_display_name: false,
          has_user_display_name: false,
          has_identity_name: false,
        },
      }

  return {
    result,
    resolution: {
      display_name: result.display_name,
      source: result.source,
      user_uuid: customer_user_uuid,
      visitor_uuid,
      role:
        pick_string(customer_user?.['role']) ??
        string_value(customer?.role) ??
        'user',
      tier: pick_string(customer_user?.['tier']) ?? 'guest',
    },
  }
}

export async function resolve_reception_room_customer_display(input: {
  room_uuid: string
  used_by: customer_display_used_by
}): Promise<reception_customer_display_resolution> {
  let participants: reception_customer_participant_row[] = []

  try {
    const participant_result = await supabase
      .from('participants')
      .select('*')
      .eq('room_uuid', input.room_uuid)

    if (participant_result.error) {
      const fallback = customer_display_name_fallback
      await emit_customer_display_name_resolved({
        room_uuid: input.room_uuid,
        user_uuid: null,
        used_by: input.used_by,
        result: {
          display_name: fallback,
          source: 'fallback',
          debug: {
            has_profile_display_name: false,
            has_user_display_name: false,
            has_identity_name: false,
          },
        },
      })

      return {
        display_name: fallback,
        source: 'fallback',
        user_uuid: null,
        visitor_uuid: null,
        role: 'user',
        tier: 'guest',
      }
    }

    participants = (participant_result.data ??
      []) as reception_customer_participant_row[]
  } catch {
    const fallback = customer_display_name_fallback

    await emit_customer_display_name_resolved({
      room_uuid: input.room_uuid,
      user_uuid: null,
      used_by: input.used_by,
      result: {
        display_name: fallback,
        source: 'fallback',
        debug: {
          has_profile_display_name: false,
          has_user_display_name: false,
          has_identity_name: false,
        },
      },
    })

    return {
      display_name: fallback,
      source: 'fallback',
      user_uuid: null,
      visitor_uuid: null,
      role: 'user',
      tier: 'guest',
    }
  }

  const customer = choose_customer_user_participant(participants)
  const customer_user_uuid = string_value(customer?.user_uuid ?? null)
  const prefetch = await fetch_reception_customer_display_prefetch(
    customer_user_uuid ? [customer_user_uuid] : [],
  )
  const { resolution, result } = resolve_reception_customer_display_from_prefetch({
    room_uuid: input.room_uuid,
    participants,
    prefetch,
  })

  await emit_customer_display_name_resolved({
    room_uuid: input.room_uuid,
    user_uuid: resolution.user_uuid,
    used_by: input.used_by,
    result,
  })

  return resolution
}

async function fetch_customer_profiles_by_user(
  user_uuids: string[],
): Promise<Map<string, { display_name: string | null }>> {
  const map = new Map<string, { display_name: string | null }>()

  if (user_uuids.length === 0) {
    return map
  }

  try {
    const result = await supabase
      .from('profiles')
      .select('user_uuid, display_name')
      .in('user_uuid', user_uuids)

    if (result.error) {
      return map
    }

    for (const raw of (result.data ?? []) as Record<string, unknown>[]) {
      const uid = pick_string(raw['user_uuid'])

      if (!uid) {
        continue
      }

      map.set(uid, {
        display_name: pick_string(raw['display_name']),
      })
    }
  } catch {
    return map
  }

  return map
}

async function fetch_user_profile_row_by_uuid(
  user_uuid: string,
  users_select: string,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await supabase
      .from('users')
      .select(users_select)
      .eq('user_uuid', user_uuid)
      .maybeSingle()

    if (result.error || !result.data) {
      return null
    }

    return result.data as unknown as Record<string, unknown>
  } catch {
    return null
  }
}

async function backfill_missing_users(
  user_uuids: string[],
  users_by_uuid: Map<string, Record<string, unknown>>,
  users_select: string,
) {
  const missing = user_uuids.filter((u) => !users_by_uuid.has(u))

  await Promise.all(
    missing.map(async (u) => {
      const row = await fetch_user_profile_row_by_uuid(u, users_select)

      if (row) {
        users_by_uuid.set(u, row)
      }
    }),
  )
}
