import 'server-only'

import { is_reception_state } from '@/lib/admin/reception/rules'
import { derive_presence_recent_from_timestamps } from '@/lib/chat/presence/rules'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

export type notify_recipient = {
  user_uuid: string
  display_name: string | null
  line_user_id: string | null
}

export type concierge_recipients = {
  open_admins: notify_recipient[]
  offline_admin_user_uuids: string[]
  total_admin_count: number
  open_admin_count: number
  has_open_admin: boolean
  owner_core: notify_recipient[]
}

export type admin_notify_recipients = {
  admins: notify_recipient[]
  active_admin_count: number
  has_active_admin_page: boolean
}

export type customer_notify_target = {
  customer_user_uuid: string | null
  customer_participant_uuid: string | null
}

type user_row = {
  user_uuid: string | null
  display_name: string | null
  role: string | null
}

type reception_row_min = {
  user_uuid: string | null
  state: string | null
}

type identity_row_min = {
  user_uuid: string | null
  provider_id: string | null
}

export async function load_line_provider_id_for_user(
  user_uuid: string,
): Promise<string | null> {
  const result = await supabase
    .from('identities')
    .select('provider_id')
    .eq('user_uuid', user_uuid)
    .eq('provider', 'line')
    .maybeSingle()

  if (result.error || !result.data) {
    return null
  }

  const row = result.data as { provider_id?: string | null }

  return typeof row.provider_id === 'string' && row.provider_id.trim()
    ? row.provider_id.trim()
    : null
}

export async function load_participant_last_channel(
  participant_uuid: string | null | undefined,
): Promise<string | null> {
  const uuid = clean_uuid(participant_uuid)

  if (!uuid) {
    return null
  }

  const result = await supabase
    .from('participants')
    .select('last_channel')
    .eq('participant_uuid', uuid)
    .maybeSingle()

  if (result.error || !result.data) {
    return null
  }

  const row = result.data as { last_channel?: unknown }
  const raw = row.last_channel

  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

export async function load_customer_notify_target_for_room(
  room_uuid: string | null | undefined,
): Promise<customer_notify_target> {
  const clean_room_uuid = clean_uuid(room_uuid)

  if (!clean_room_uuid) {
    return {
      customer_user_uuid: null,
      customer_participant_uuid: null,
    }
  }

  const result = await supabase
    .from('participants')
    .select('participant_uuid, user_uuid')
    .eq('room_uuid', clean_room_uuid)
    .eq('role', 'user')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (result.error || !result.data) {
    return {
      customer_user_uuid: null,
      customer_participant_uuid: null,
    }
  }

  const row = result.data as {
    participant_uuid?: string | null
    user_uuid?: string | null
  }

  return {
    customer_user_uuid: clean_uuid(row.user_uuid ?? null),
    customer_participant_uuid: clean_uuid(row.participant_uuid ?? null),
  }
}

/**
 * Single core query that loads admins + owner/core users and resolves their
 * reception state and LINE provider id in one pass.
 *
 * - Admins with no `receptions` row are treated as `open` (default).
 * - Owner/core are returned regardless of reception state (used for
 *   escalation fallback).
 */
export async function load_concierge_recipients(): Promise<concierge_recipients> {
  const users_result = await supabase
    .from('users')
    .select('user_uuid, display_name, role')
    .in('role', ['admin', 'owner', 'core'])

  if (users_result.error) {
    throw users_result.error
  }

  const all_rows = (users_result.data ?? []) as user_row[]
  const all_users = all_rows.filter(
    (row): row is user_row & { user_uuid: string; role: string } =>
      typeof row.user_uuid === 'string' &&
      row.user_uuid.length > 0 &&
      typeof row.role === 'string',
  )

  const admin_users = all_users.filter((row) => row.role === 'admin')
  const owner_core_users = all_users.filter(
    (row) => row.role === 'owner' || row.role === 'core',
  )

  const admin_user_uuids = admin_users.map((row) => row.user_uuid)
  const reception_state_by_uuid = new Map<string, string>()

  if (admin_user_uuids.length > 0) {
    const reception_result = await supabase
      .from('receptions')
      .select('user_uuid, state')
      .in('user_uuid', admin_user_uuids)

    if (reception_result.error) {
      throw reception_result.error
    }

    for (const row of (reception_result.data ?? []) as reception_row_min[]) {
      if (typeof row.user_uuid === 'string' && row.user_uuid.length > 0) {
        reception_state_by_uuid.set(row.user_uuid, row.state ?? '')
      }
    }
  }

  const open_admin_users: typeof admin_users = []
  const offline_admin_user_uuids: string[] = []

  for (const admin of admin_users) {
    const raw_state = reception_state_by_uuid.get(admin.user_uuid)
    const resolved_state = is_reception_state(raw_state) ? raw_state : 'open'

    if (resolved_state === 'open') {
      open_admin_users.push(admin)
    } else {
      offline_admin_user_uuids.push(admin.user_uuid)
    }
  }

  const need_line_lookup_uuids = [
    ...open_admin_users.map((row) => row.user_uuid),
    ...owner_core_users.map((row) => row.user_uuid),
  ]
  const line_user_id_by_uuid = new Map<string, string>()

  if (need_line_lookup_uuids.length > 0) {
    const identity_result = await supabase
      .from('identities')
      .select('user_uuid, provider_id')
      .eq('provider', 'line')
      .in('user_uuid', need_line_lookup_uuids)

    if (identity_result.error) {
      throw identity_result.error
    }

    for (const row of (identity_result.data ?? []) as identity_row_min[]) {
      if (
        typeof row.user_uuid !== 'string' ||
        row.user_uuid.length === 0 ||
        typeof row.provider_id !== 'string' ||
        row.provider_id.length === 0
      ) {
        continue
      }

      if (!line_user_id_by_uuid.has(row.user_uuid)) {
        line_user_id_by_uuid.set(row.user_uuid, row.provider_id)
      }
    }
  }

  const to_recipient = (row: {
    user_uuid: string
    display_name: string | null
  }): notify_recipient => ({
    user_uuid: row.user_uuid,
    display_name: row.display_name,
    line_user_id: line_user_id_by_uuid.get(row.user_uuid) ?? null,
  })

  return {
    open_admins: open_admin_users.map(to_recipient),
    offline_admin_user_uuids,
    total_admin_count: admin_users.length,
    open_admin_count: open_admin_users.length,
    has_open_admin: open_admin_users.length > 0,
    owner_core: owner_core_users.map(to_recipient),
  }
}

export async function load_admin_notify_recipients(input: {
  room_uuid: string | null
  exclude_user_uuid?: string | null
}): Promise<admin_notify_recipients> {
  const exclude_user_uuid = clean_uuid(input.exclude_user_uuid ?? null)
  const users_result = await supabase
    .from('users')
    .select('user_uuid, display_name, role')
    .in('role', ['admin', 'owner', 'core'])

  if (users_result.error) {
    throw users_result.error
  }

  const admins = ((users_result.data ?? []) as user_row[])
    .filter(
      (row): row is user_row & { user_uuid: string } =>
        typeof row.user_uuid === 'string' &&
        row.user_uuid.length > 0 &&
        row.user_uuid !== exclude_user_uuid,
    )
    .map((row) => ({
      user_uuid: row.user_uuid,
      display_name: row.display_name,
      line_user_id: null,
    }))

  const room_uuid = clean_uuid(input.room_uuid)

  if (!room_uuid) {
    return {
      admins,
      active_admin_count: 0,
      has_active_admin_page: false,
    }
  }

  const presence_result = await supabase
    .from('participants')
    .select('participant_uuid, user_uuid, last_seen_at, is_typing, typing_at')
    .eq('room_uuid', room_uuid)
    .in('role', ['admin', 'concierge'])

  if (presence_result.error) {
    return {
      admins,
      active_admin_count: 0,
      has_active_admin_page: false,
    }
  }

  const now = new Date()
  const active_admin_count = (presence_result.data ?? []).filter((row) => {
    const user_uuid =
      typeof row.user_uuid === 'string' && row.user_uuid.length > 0
        ? row.user_uuid
        : null

    if (exclude_user_uuid && user_uuid === exclude_user_uuid) {
      return false
    }

    return derive_presence_recent_from_timestamps({
      last_seen_at:
        typeof row.last_seen_at === 'string' ? row.last_seen_at : null,
      is_typing: row.is_typing === true,
      typing_at: typeof row.typing_at === 'string' ? row.typing_at : null,
      now,
    })
  }).length

  return {
    admins,
    active_admin_count,
    has_active_admin_page: active_admin_count > 0,
  }
}

/**
 * Resolve the requesting user's display_name for the concierge message
 * template. Falls back to a generic label when the user_uuid is unknown
 * (anonymous visitors) or no row exists.
 */
export async function read_requester_display_name(
  user_uuid: string | null,
): Promise<string> {
  const fallback = 'ユーザー'

  if (!user_uuid) {
    return fallback
  }

  const result = await supabase
    .from('users')
    .select('display_name')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (result.error) {
    return fallback
  }

  const data = result.data as { display_name: string | null } | null
  const name = data?.display_name?.trim()

  return name && name.length > 0 ? name : fallback
}
