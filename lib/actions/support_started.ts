import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { public_actions_table_name } from './table'

export type insert_support_started_action_input = {
  room_uuid: string
  admin_user_uuid: string
  admin_participant_uuid: string | null
  customer_user_uuid: string | null
  customer_participant_uuid: string | null
  discord_id: string | null
  body: string
  customer_display_name: string
  admin_internal_name: string | null
  admin_display_label: string
}

export type insert_support_started_action_ok = {
  ok: true
  action_row_id: string
  created_at: string
}

export type insert_support_started_action_result =
  | insert_support_started_action_ok
  | { ok: false; error: unknown }

function read_action_row_id(row: Record<string, unknown>): string {
  for (const key of ['action_uuid', 'uuid', 'id', 'action_id']) {
    const value = row[key]

    if (value !== undefined && value !== null && String(value).length > 0) {
      return String(value)
    }
  }

  return ''
}

function should_attach_meta_json(): boolean {
  return process.env.ACTIONS_INSERT_META_JSON?.trim() !== 'false'
}

/**
 * Inserts one `support_started` row into the configured public action table.
 * Extra fields (display names) go to `meta_json` when enabled and the column exists.
 */
export async function insert_support_started_action(
  client: SupabaseClient,
  input: insert_support_started_action_input,
): Promise<insert_support_started_action_result> {
  const created_at = new Date().toISOString()
  const table = public_actions_table_name()

  const row: Record<string, unknown> = {
    action_type: 'support_started',
    body: input.body,
    room_uuid: input.room_uuid,
    admin_user_uuid: input.admin_user_uuid,
    admin_participant_uuid: input.admin_participant_uuid,
    customer_user_uuid: input.customer_user_uuid,
    customer_participant_uuid: input.customer_participant_uuid,
    discord_id: input.discord_id,
    created_at,
  }

  if (should_attach_meta_json()) {
    row.meta_json = {
      customer_display_name: input.customer_display_name,
      admin_internal_name: input.admin_internal_name,
      admin_display_label: input.admin_display_label,
      source: 'admin_reception_open',
    }
  }

  const inserted = await client.from(table).insert(row).select('*').single()

  if (inserted.error) {
    return { ok: false, error: inserted.error }
  }

  const data = (inserted.data ?? null) as Record<string, unknown> | null
  const action_row_id = data ? read_action_row_id(data) : ''
  const created_at_out =
    typeof data?.created_at === 'string' && data.created_at.length > 0
      ? data.created_at
      : created_at

  if (!action_row_id) {
    return {
      ok: false,
      error: new Error(
        `${table}: insert ok but no primary key in response (expected action_uuid, uuid, id, or action_id)`,
      ),
    }
  }

  return {
    ok: true,
    action_row_id,
    created_at: created_at_out,
  }
}
