import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'

import type { presence_write_decision, receiver_presence_row } from './rules'

export type presence_write_result =
  | {
      ok: true
    }
  | {
      ok: false
      error: string
    }

export async function write_presence(
  decision: presence_write_decision,
): Promise<presence_write_result> {
  if (!decision.ok) {
    return {
      ok: false,
      error: decision.skipped_reason,
    }
  }

  const seen_at = new Date().toISOString()
  const result = await supabase.from('presence').upsert(
    {
      user_uuid: decision.user_uuid,
      role: decision.role,
      channel: decision.channel,
      area: decision.area,
      visible: decision.visible,
      seen_at,
    },
    { onConflict: 'user_uuid' },
  )

  if (result.error) {
    return {
      ok: false,
      error: result.error.message,
    }
  }

  return { ok: true }
}

export async function load_presence_by_user_uuids(
  user_uuids: string[],
): Promise<Map<string, receiver_presence_row>> {
  const clean_user_uuids = user_uuids
    .map((user_uuid) => clean_uuid(user_uuid))
    .filter((user_uuid): user_uuid is string => Boolean(user_uuid))

  if (clean_user_uuids.length === 0) {
    return new Map()
  }

  const result = await supabase
    .from('presence')
    .select('user_uuid, role, channel, area, visible, seen_at')
    .in('user_uuid', clean_user_uuids)

  if (result.error) {
    return new Map()
  }

  const presence_by_user_uuid = new Map<string, receiver_presence_row>()

  for (const row of result.data ?? []) {
    const user_uuid = clean_uuid(
      typeof row.user_uuid === 'string' ? row.user_uuid : null,
    )

    if (!user_uuid || presence_by_user_uuid.has(user_uuid)) {
      continue
    }

    presence_by_user_uuid.set(user_uuid, {
      user_uuid,
      role: typeof row.role === 'string' ? row.role : null,
      channel: typeof row.channel === 'string' ? row.channel : null,
      area: typeof row.area === 'string' ? row.area : null,
      visible: row.visible === true,
      seen_at: typeof row.seen_at === 'string' ? row.seen_at : null,
    })
  }

  return presence_by_user_uuid
}

export async function load_presence_by_user_uuid(
  user_uuid: string | null,
): Promise<receiver_presence_row | null> {
  const clean_user_uuid = clean_uuid(user_uuid)

  if (!clean_user_uuid) {
    return null
  }

  const presence_by_user_uuid = await load_presence_by_user_uuids([
    clean_user_uuid,
  ])

  return presence_by_user_uuid.get(clean_user_uuid) ?? null
}
