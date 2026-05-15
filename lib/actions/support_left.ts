import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { clean_uuid } from '@/lib/db/uuid/payload'

import { public_actions_table_name } from './table'

export type insert_support_left_action_input = {
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

export type insert_support_left_action_ok = {
  ok: true
  action_row_id: string
  created_at: string
}

export type insert_support_left_action_result =
  | insert_support_left_action_ok
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

function optional_context_fields(input: insert_support_left_action_input) {
  return {
    admin_user_uuid: input.admin_user_uuid,
    admin_participant_uuid: input.admin_participant_uuid,
    customer_user_uuid: input.customer_user_uuid,
    customer_participant_uuid: input.customer_participant_uuid,
    discord_id: input.discord_id,
  }
}

function build_chat_actions_row(input: insert_support_left_action_input) {
  const created_at = new Date().toISOString()

  return {
    row: {
      room_uuid: input.room_uuid,
      actor_user_uuid: input.admin_user_uuid,
      actor_participant_uuid: input.admin_participant_uuid,
      actor_display_name: input.admin_display_label,
      actor_role: 'admin',
      action_type: 'support_left',
      body: input.body,
      visibility: 'admin',
      source_channel: 'admin',
      created_at,
      meta_json: {
        customer_display_name: input.customer_display_name,
        admin_internal_name: input.admin_internal_name,
        admin_display_label: input.admin_display_label,
        ...optional_context_fields(input),
        source: 'admin_support_leave',
      },
      ...optional_context_fields(input),
    },
    created_at,
  }
}

export async function insert_support_left_action(
  client: SupabaseClient,
  input: insert_support_left_action_input,
): Promise<insert_support_left_action_result> {
  const table = public_actions_table_name()
  const { row, created_at } = build_chat_actions_row(input)

  let inserted = await client.from(table).insert(row).select('*').single()
  let inserted_row = row

  if (
    inserted.error &&
    table === 'chat_actions' &&
    (inserted.error.code === 'PGRST204' ||
      inserted.error.message.includes('Could not find'))
  ) {
    const stripped = { ...row }
    for (const key of [
      'admin_user_uuid',
      'admin_participant_uuid',
      'customer_user_uuid',
      'customer_participant_uuid',
      'discord_id',
      'meta_json',
    ]) {
      delete stripped[key as keyof typeof stripped]
    }
    inserted_row = stripped
    inserted = await client.from(table).insert(stripped).select('*').single()
  }

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
      error: new Error(`${table}: insert ok but no primary key in response`),
    }
  }

  const cleaned = clean_uuid(action_row_id)

  if (!cleaned) {
    return { ok: false, error: new Error('invalid_action_row_id') }
  }

  return {
    ok: true,
    action_row_id: cleaned,
    created_at: created_at_out,
  }
}
