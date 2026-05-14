import 'server-only'

import { control } from '@/lib/config/control'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'
import type { chat_channel } from './room'
import type { bundle_sender, message_bundle } from './message'

/** DB table used for chat archive rows (must match Realtime `postgres_changes` table). */
export const chat_archived_messages_table = 'public.messages'

async function emit_chat_message_insert_succeeded(input: {
  inserted_table: string
  inserted_message_uuid: string
  inserted_room_uuid: string
  channel: chat_channel
}) {
  await debug_event({
    category: 'chat_message',
    event: 'chat_message_insert_succeeded',
    payload: {
      inserted_table: input.inserted_table,
      inserted_message_uuid: input.inserted_message_uuid,
      inserted_room_uuid: input.inserted_room_uuid,
      channel: input.channel,
      phase: 'messages_insert',
    },
  })
}

export type archived_message = {
  archive_uuid: string
  room_uuid: string
  sequence: number
  bundle: message_bundle
  created_at: string
}

type archive_row = {
  message_uuid: string
  room_uuid: string
  body: string | null
  created_at: string
}

type parsed_archive_body = {
  type?: string
  actor_type?: 'user' | 'bot' | 'system'
  direction?: string
  sender_role?: string
  line_message_id?: string
  bundle_type?: string
  bundle?: {
    bundle_type?: string
    sender?: string
  }
  metadata?: {
    bundle_type?: string
    actor_type?: 'user' | 'bot' | 'system'
    initial_seed?: boolean
    line_message_id?: string
    intent?: string
    mode?: string
  }
}

export type archive_incoming_line_text_input = {
  room_uuid: string
  participant_uuid: string
  user_uuid?: string | null
  visitor_uuid: string | null
  line_user_id: string
  line_message_id: string
  text: string
  created_at: string
  webhook_event_id?: string | null
  delivery_context_redelivery?: boolean | null
  bundle: message_bundle
}

export type archive_incoming_line_text_result = {
  archived_message: archived_message | null
  is_duplicate: boolean
  message_uuid: string | null
}

function parse_bundle(row: archive_row): message_bundle {
  if (!row.body) {
    return {
      bundle_uuid: row.message_uuid,
      bundle_type: 'text',
      sender: 'bot',
      version: 1,
      payload: {
        text: '',
      },
    }
  }

  try {
    const parsed = JSON.parse(row.body) as {
      bundle?: message_bundle
      bundle_type?: string
    }

    if (parsed.bundle) {
      return parsed.bundle
    }

    if (parsed.bundle_type) {
      return parsed as message_bundle
    }
  } catch {
    // Plain text rows are normalized into text bundles below.
  }

  return {
    bundle_uuid: row.message_uuid,
    bundle_type: 'text',
    sender: 'bot',
    version: 1,
    payload: {
      text: row.body,
    },
  }
}

function normalize_archive(
  row: archive_row,
  index: number,
): archived_message {
  return {
    archive_uuid: row.message_uuid,
    room_uuid: row.room_uuid,
    sequence: index + 1,
    bundle: parse_bundle(row),
    created_at: row.created_at,
  }
}

export async function load_archived_messages(room_uuid: string) {
  const result = await supabase
    .from('messages')
    .select('message_uuid, room_uuid, body, created_at')
    .eq('room_uuid', room_uuid)
    .order('created_at', { ascending: true })

  if (result.error) {
    throw result.error
  }

  return ((result.data ?? []) as archive_row[])
    .map(normalize_archive)
}

async function count_archived_messages(room_uuid: string) {
  const result = await supabase
    .from('messages')
    .select('message_uuid', {
      count: 'exact',
      head: true,
    })
    .eq('room_uuid', room_uuid)

  if (result.error) {
    throw result.error
  }

  return result.count ?? 0
}

function debug_incoming_line_archive_payload(
  input: archive_incoming_line_text_input,
  message_uuid?: string | null,
) {
  return {
    room_uuid: input.room_uuid,
    participant_uuid: input.participant_uuid,
    user_uuid: input.user_uuid ?? null,
    visitor_uuid: input.visitor_uuid,
    line_user_id: input.line_user_id,
    line_message_id: input.line_message_id,
    direction: 'incoming' as const,
    channel: 'line' as const,
    message_uuid: message_uuid ?? undefined,
  }
}

function parse_archive_body(body: string | null): parsed_archive_body | null {
  if (!body) {
    return null
  }

  try {
    return JSON.parse(body) as parsed_archive_body
  } catch {
    return null
  }
}

function archive_row_has_line_message_id(
  row: archive_row,
  line_message_id: string,
) {
  const body = parse_archive_body(row.body)

  return (
    body?.line_message_id === line_message_id ||
    body?.metadata?.line_message_id === line_message_id
  )
}

export async function archive_incoming_line_text(
  input: archive_incoming_line_text_input,
): Promise<archive_incoming_line_text_result> {
  if (control.debug.chat_room) {
    await debug_event({
      category: 'chat_room',
      event: 'incoming_message_archive_started',
      payload: debug_incoming_line_archive_payload(input),
    })
  }

  try {
    const existing_result = await supabase
      .from('messages')
      .select('message_uuid, room_uuid, body, created_at')
      .eq('room_uuid', input.room_uuid)
      .order('created_at', { ascending: true })

    if (existing_result.error) {
      throw existing_result.error
    }

    const existing_rows = (existing_result.data ?? []) as archive_row[]
    const duplicate = existing_rows.find((row) =>
      archive_row_has_line_message_id(row, input.line_message_id),
    )

    if (duplicate) {
      if (control.debug.chat_room) {
        await debug_event({
          category: 'chat_room',
          event: 'incoming_message_archive_skipped_duplicate',
          payload: debug_incoming_line_archive_payload(
            input,
            duplicate.message_uuid,
          ),
        })
      }

      return {
        archived_message: normalize_archive(
          duplicate,
          existing_rows.indexOf(duplicate),
        ),
        is_duplicate: true,
        message_uuid: duplicate.message_uuid,
      }
    }

    const sanitized_user_uuid = clean_uuid(input.user_uuid)
    const sanitized_visitor_uuid = clean_uuid(input.visitor_uuid)
    const sanitized_participant_uuid = clean_uuid(input.participant_uuid)
    const sanitized_room_uuid = clean_uuid(input.room_uuid)

    if (!sanitized_room_uuid || !sanitized_participant_uuid) {
      throw new Error(
        `archive_incoming_line_text: invalid uuid (room=${input.room_uuid}, participant=${input.participant_uuid})`,
      )
    }

    const body = {
      type: input.bundle.bundle_type,
      actor_type: 'user' as const,
      sender_role: 'user' as const,
      source_channel: 'line' as const,
      channel: 'line' as const,
      direction: 'incoming' as const,
      message_type: 'text' as const,
      text: input.text,
      participant_uuid: sanitized_participant_uuid,
      ...(sanitized_user_uuid ? { user_uuid: sanitized_user_uuid } : {}),
      ...(sanitized_visitor_uuid
        ? { visitor_uuid: sanitized_visitor_uuid }
        : {}),
      line_message_id: input.line_message_id,
      line_user_id: input.line_user_id,
      metadata: {
        line_message_id: input.line_message_id,
        line_user_id: input.line_user_id,
        webhook_event_id: input.webhook_event_id ?? null,
        delivery_context_redelivery:
          input.delivery_context_redelivery ?? null,
      },
      payload:
        'payload' in input.bundle
          ? input.bundle.payload
          : undefined,
      bundle: input.bundle,
    }
    const result = await supabase
      .from('messages')
      .insert({
        room_uuid: sanitized_room_uuid,
        participant_uuid: sanitized_participant_uuid,
        channel: 'line',
        body: JSON.stringify(body),
        created_at: input.created_at,
      })
      .select('message_uuid, room_uuid, body, created_at')
      .single()

    if (result.error) {
      throw result.error
    }

    const row = result.data as archive_row

    await emit_chat_message_insert_succeeded({
      inserted_table: chat_archived_messages_table,
      inserted_message_uuid: row.message_uuid,
      inserted_room_uuid: row.room_uuid,
      channel: 'line',
    })

    if (control.debug.chat_room) {
      await debug_event({
        category: 'chat_room',
        event: 'incoming_message_archived',
        payload: debug_incoming_line_archive_payload(
          input,
          row.message_uuid,
        ),
      })
    }

    return {
      archived_message: normalize_archive(row, existing_rows.length),
      is_duplicate: false,
      message_uuid: row.message_uuid,
    }
  } catch (error) {
    console.error(
      '[archive_incoming_line_text]',
      debug_incoming_line_archive_payload(input),
      error,
    )

    throw error
  }
}

function archive_body_bundle_type(body: parsed_archive_body | null) {
  return (
    body?.bundle?.bundle_type ??
    body?.bundle_type ??
    body?.metadata?.bundle_type ??
    body?.type ??
    null
  )
}

function archive_body_is_outgoing_initial(
  body: parsed_archive_body | null,
) {
  const bundle_type = archive_body_bundle_type(body)

  if (bundle_type !== 'welcome' && bundle_type !== 'initial_carousel') {
    return false
  }

  if (body?.metadata?.initial_seed === true) {
    return true
  }

  if (body?.direction === 'incoming' || body?.sender_role === 'user') {
    return false
  }

  if (body?.direction === 'outgoing' || body?.bundle?.sender === 'bot') {
    return true
  }

  return true
}

function row_body_suggests_welcome_or_carousel(body: string | null) {
  if (typeof body !== 'string' || body.length < 8) {
    return false
  }

  return (
    body.includes('"bundle_type":"welcome"') ||
    body.includes('"bundle_type":"initial_carousel"') ||
    body.includes('"content_key":"initial.welcome"') ||
    body.includes('"type":"welcome"')
  )
}

export async function has_initial_messages(room_uuid: string) {
  const result = await supabase
    .from('messages')
    .select('message_uuid, room_uuid, body, created_at')
    .eq('room_uuid', room_uuid)

  if (result.error) {
    throw result.error
  }

  for (const row of (result.data ?? []) as archive_row[]) {
    if (row_body_suggests_welcome_or_carousel(row.body)) {
      return true
    }

    if (archive_body_is_outgoing_initial(parse_archive_body(row.body))) {
      return true
    }
  }

  return false
}

type actor_type = 'user' | 'bot' | 'system'

const SYSTEM_BUNDLE_CONTENT_KEY_PREFIXES: ReadonlyArray<string> = [
  'room.mode.',
  'initial.',
  'line.followup.',
]

const SYSTEM_BUNDLE_TYPES: ReadonlySet<string> = new Set([
  'welcome',
  'initial_carousel',
  'room_action_log',
])

function resolve_actor_type(bundle: message_bundle): actor_type {
  if (SYSTEM_BUNDLE_TYPES.has(bundle.bundle_type)) {
    return 'system'
  }

  const content_key =
    'content_key' in bundle && typeof bundle.content_key === 'string'
      ? bundle.content_key
      : null

  if (
    content_key &&
    SYSTEM_BUNDLE_CONTENT_KEY_PREFIXES.some((prefix) =>
      content_key.startsWith(prefix),
    )
  ) {
    return 'system'
  }

  if (bundle.sender === 'user') {
    return 'user'
  }

  return 'bot'
}

function archive_direction_for_sender(sender: bundle_sender): 'incoming' | 'outgoing' {
  if (sender === 'user') {
    return 'incoming'
  }

  return 'outgoing'
}

export async function archive_message_bundles(
  input: {
    room_uuid: string
    participant_uuid: string
    bot_participant_uuid: string
    /** DB `participant_uuid` for outgoing admin or concierge text bundles */
    staff_participant_uuid?: string | null
    channel: chat_channel
    bundles: message_bundle[]
  },
) {
  if (input.bundles.length === 0) {
    return []
  }

  const existing_message_count =
    await count_archived_messages(input.room_uuid)
  const next_sequence = existing_message_count + 1
  const sanitized_room_uuid = clean_uuid(input.room_uuid)
  const sanitized_user_participant_uuid = clean_uuid(input.participant_uuid)
  const sanitized_bot_participant_uuid = clean_uuid(input.bot_participant_uuid)
  const sanitized_staff_participant_uuid = clean_uuid(
    input.staff_participant_uuid ?? null,
  )

  if (
    !sanitized_room_uuid ||
    !sanitized_user_participant_uuid ||
    !sanitized_bot_participant_uuid
  ) {
    throw new Error(
      `archive_message_bundles: invalid uuid (room=${input.room_uuid}, user_participant=${input.participant_uuid}, bot_participant=${input.bot_participant_uuid})`,
    )
  }

  for (const bundle of input.bundles) {
    if (
      (bundle.sender === 'admin' || bundle.sender === 'concierge') &&
      !sanitized_staff_participant_uuid
    ) {
      throw new Error(
        'archive_message_bundles: staff_participant_uuid required for admin or concierge sender',
      )
    }
  }

  const rows = input.bundles.map((bundle, index) => {
    const bundle_metadata =
      'metadata' in bundle &&
      bundle.metadata &&
      typeof bundle.metadata === 'object'
        ? bundle.metadata
        : {}

    const sender_participant_uuid =
      bundle.sender === 'user'
        ? sanitized_user_participant_uuid
        : bundle.sender === 'admin' || bundle.sender === 'concierge'
          ? sanitized_staff_participant_uuid!
          : sanitized_bot_participant_uuid

    const actor_type = resolve_actor_type(bundle)

    return {
      room_uuid: sanitized_room_uuid,
      participant_uuid: sender_participant_uuid,
      channel: input.channel,
      body: JSON.stringify({
        type: bundle.bundle_type,
        actor_type,
        sender_role: bundle.sender,
        direction: archive_direction_for_sender(bundle.sender),
        locale: bundle.locale,
        content_key: bundle.content_key,
        sequence: next_sequence + index,
        payload: 'payload' in bundle ? bundle.payload : undefined,
        metadata: {
          ...bundle_metadata,
          bundle_type: bundle.bundle_type,
          actor_type,
          initial_seed:
            bundle.bundle_type === 'welcome' ||
            bundle.bundle_type === 'initial_carousel',
        },
        bundle,
      }),
    }
  })

  const result = await supabase
    .from('messages')
    .insert(rows)
    .select('message_uuid, room_uuid, body, created_at')

  if (result.error) {
    throw result.error
  }

  const inserted = (result.data ?? []) as archive_row[]

  for (const row of inserted) {
    await emit_chat_message_insert_succeeded({
      inserted_table: chat_archived_messages_table,
      inserted_message_uuid: row.message_uuid,
      inserted_room_uuid: row.room_uuid,
      channel: input.channel,
    })
  }

  if (control.debug.chat_room) {
    for (let i = 0; i < inserted.length; i++) {
      const row = inserted[i]
      const bundle = input.bundles[i]
      const direction = archive_direction_for_sender(bundle.sender)

      await debug_event({
        category: 'chat_room',
        event:
          direction === 'incoming'
            ? 'incoming_message_archived'
            : 'outgoing_message_archived',
        payload: {
          room_uuid: input.room_uuid,
          message_uuid: row.message_uuid,
          direction,
          channel: input.channel,
        },
      })
    }
  }

  return inserted.map((row, index) =>
    normalize_archive(row, existing_message_count + index),
  )
}
