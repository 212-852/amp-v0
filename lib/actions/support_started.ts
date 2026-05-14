import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { clean_uuid } from '@/lib/db/uuid/payload'

import { public_actions_table_name } from './table'
import type { support_started_notify_meta } from '@/lib/notify'

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
  insert_payload_keys: string[]
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

function optional_context_fields(input: insert_support_started_action_input) {
  return {
    admin_user_uuid: input.admin_user_uuid,
    admin_participant_uuid: input.admin_participant_uuid,
    customer_user_uuid: input.customer_user_uuid,
    customer_participant_uuid: input.customer_participant_uuid,
    discord_id: input.discord_id,
  }
}

function build_chat_actions_row(input: insert_support_started_action_input) {
  const created_at = new Date().toISOString()
  const row: Record<string, unknown> = {
    room_uuid: input.room_uuid,
    actor_user_uuid: input.admin_user_uuid,
    actor_participant_uuid: input.admin_participant_uuid,
    actor_display_name: input.admin_display_label,
    actor_role: 'admin',
    action_type: 'support_started',
    body: input.body,
    visibility: 'admin',
    source_channel: 'web',
    created_at,
  }

  Object.assign(row, optional_context_fields(input))

  if (should_attach_meta_json()) {
    row.meta_json = {
      customer_display_name: input.customer_display_name,
      admin_internal_name: input.admin_internal_name,
      admin_display_label: input.admin_display_label,
      ...optional_context_fields(input),
      source: 'admin_reception_open',
    }
  }

  return { row, created_at }
}

function strip_chat_actions_optional_context(row: Record<string, unknown>) {
  const stripped = { ...row }

  for (const key of [
    'admin_user_uuid',
    'admin_participant_uuid',
    'customer_user_uuid',
    'customer_participant_uuid',
    'discord_id',
    'meta_json',
  ]) {
    delete stripped[key]
  }

  return stripped
}

function build_legacy_actions_row(input: insert_support_started_action_input) {
  const created_at = new Date().toISOString()
  const row: Record<string, unknown> = {
    action_type: 'support_started',
    body: input.body,
    room_uuid: input.room_uuid,
    ...optional_context_fields(input),
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

  return { row, created_at }
}

/**
 * Inserts one `support_started` row into the configured public action table.
 * Extra fields (display names) go to `meta_json` when enabled and the column exists.
 */
export async function insert_support_started_action(
  client: SupabaseClient,
  input: insert_support_started_action_input,
): Promise<insert_support_started_action_result> {
  const table = public_actions_table_name()
  const { row, created_at } =
    table === 'chat_actions'
      ? build_chat_actions_row(input)
      : build_legacy_actions_row(input)

  let inserted = await client.from(table).insert(row).select('*').single()
  let inserted_row = row

  if (
    inserted.error &&
    table === 'chat_actions' &&
    (inserted.error.code === 'PGRST204' ||
      inserted.error.message.includes('Could not find'))
  ) {
    inserted_row = strip_chat_actions_optional_context(row)
    inserted = await client.from(table).insert(inserted_row).select('*').single()
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
      error: new Error(
        `${table}: insert ok but no primary key in response (expected action_uuid, uuid, id, or action_id)`,
      ),
    }
  }

  return {
    ok: true,
    action_row_id,
    created_at: created_at_out,
    insert_payload_keys: Object.keys(inserted_row).sort(),
  }
}

function parse_meta_json(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }

  return {}
}

/**
 * Merges `notify/index` support_started delivery outcome into the action row
 * `meta_json.support_started_notify` (Discord webhook / thread path results).
 */
export async function merge_support_started_notify_meta_into_chat_action(
  client: SupabaseClient,
  input: {
    action_uuid: string
    notify_meta: support_started_notify_meta
  },
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const action_uuid = clean_uuid(input.action_uuid)

  if (!action_uuid) {
    return { ok: false, error: new Error('invalid_action_uuid') }
  }

  const table = public_actions_table_name()
  const pick = await client
    .from(table)
    .select('meta_json')
    .eq('action_uuid', action_uuid)
    .maybeSingle()

  if (pick.error) {
    return { ok: false, error: pick.error }
  }

  const prev = parse_meta_json(pick.data?.meta_json)
  const existing_notify =
    typeof prev.support_started_notify === 'object' &&
    prev.support_started_notify !== null &&
    !Array.isArray(prev.support_started_notify)
      ? (prev.support_started_notify as Record<string, unknown>)
      : {}

  const next_meta = {
    ...prev,
    support_started_notify: {
      ...existing_notify,
      ...input.notify_meta,
      saved_at: new Date().toISOString(),
    },
  }

  const updated = await client
    .from(table)
    .update({ meta_json: next_meta })
    .eq('action_uuid', action_uuid)

  if (updated.error) {
    return { ok: false, error: updated.error }
  }

  return { ok: true }
}
