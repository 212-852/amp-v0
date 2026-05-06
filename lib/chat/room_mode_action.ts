import 'server-only'

import { supabase } from '@/lib/db/supabase'
import { notify } from '@/lib/notify'
import { archive_message_bundles } from './archive'
import { upsert_room_discord_action_log } from './discord_action_log'
import {
  build_room_mode_admin_accepted_bundle,
  build_room_mode_notice_bundle,
} from './message'
import type { chat_locale } from './message'
import {
  load_room_row,
  parse_room_mode,
  type chat_channel,
  type chat_room,
  type room_mode,
} from './room'
import {
  room_mode_can_accept_concierge,
  room_mode_can_request_concierge,
  room_mode_can_resume_bot,
  type room_mode_gate_row,
} from './room_mode_rules'

type stored_room_row = NonNullable<Awaited<ReturnType<typeof load_room_row>>>

const PARTICIPANT_ARCHIVE_SELECT =
  'participant_uuid, visitor_uuid, user_uuid, room_uuid, role'

function to_gate(row: stored_room_row): room_mode_gate_row {
  return {
    mode: parse_room_mode(row.mode),
    assigned_admin_uuid: row.assigned_admin_uuid ?? null,
  }
}

function discord_log_content_request(room_uuid: string): string {
  return ['Concierge requested', `room_uuid: ${room_uuid}`].join('\n')
}

async function persist_discord_tracking(input: {
  room_uuid: string
  discord_action_post_id: string | null
  discord_action_thread_id: string | null
}) {
  const result = await supabase
    .from('rooms')
    .update({
      discord_action_post_id: input.discord_action_post_id,
      discord_action_thread_id: input.discord_action_thread_id,
      updated_at: new Date().toISOString(),
    })
    .eq('room_uuid', input.room_uuid)

  if (result.error) {
    throw result.error
  }
}

async function load_room_archive_handles(room_uuid: string): Promise<{
  participant_uuid: string
  bot_participant_uuid: string
  visitor_uuid: string
  user_uuid: string | null
} | null> {
  const user_result = await supabase
    .from('participants')
    .select(PARTICIPANT_ARCHIVE_SELECT)
    .eq('room_uuid', room_uuid)
    .eq('role', 'user')
    .maybeSingle()

  const bot_result = await supabase
    .from('participants')
    .select(PARTICIPANT_ARCHIVE_SELECT)
    .eq('room_uuid', room_uuid)
    .eq('role', 'bot')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (user_result.error) {
    throw user_result.error
  }

  if (bot_result.error) {
    throw bot_result.error
  }

  const user = user_result.data as {
    participant_uuid: string
    visitor_uuid: string | null
    user_uuid: string | null
  } | null
  const bot = bot_result.data as { participant_uuid: string } | null

  if (
    !user?.participant_uuid ||
    !bot?.participant_uuid ||
    !user.visitor_uuid
  ) {
    return null
  }

  return {
    participant_uuid: user.participant_uuid,
    bot_participant_uuid: bot.participant_uuid,
    visitor_uuid: user.visitor_uuid,
    user_uuid: user.user_uuid ?? null,
  }
}

export type room_mode_action_result =
  | { ok: true; mode: room_mode; assigned_admin_uuid: string | null }
  | {
      ok: false
      error: 'forbidden' | 'room_not_found' | 'invalid_transition'
    }

export async function room_mode_request_concierge(input: {
  chat_room: chat_room
  channel: chat_channel
  locale: chat_locale
}): Promise<room_mode_action_result> {
  const row = await load_room_row(input.chat_room.room_uuid)

  if (!row) {
    return { ok: false, error: 'room_not_found' }
  }

  if (!room_mode_can_request_concierge(to_gate(row))) {
    return { ok: false, error: 'invalid_transition' }
  }

  const now = new Date().toISOString()

  const update = await supabase
    .from('rooms')
    .update({
      mode: 'concierge',
      assigned_admin_uuid: null,
      concierge_requested_at: now,
      updated_at: now,
    })
    .eq('room_uuid', row.room_uuid)

  if (update.error) {
    throw update.error
  }

  const notice = build_room_mode_notice_bundle({
    notice: 'concierge_requested',
    locale: input.locale,
  })

  await archive_message_bundles({
    room_uuid: input.chat_room.room_uuid,
    participant_uuid: input.chat_room.participant_uuid,
    bot_participant_uuid: input.chat_room.bot_participant_uuid,
    channel: input.channel,
    bundles: [notice],
  })

  await notify({
    event: 'concierge_room_request',
    room_uuid: row.room_uuid,
    visitor_uuid: input.chat_room.visitor_uuid,
    user_uuid: input.chat_room.user_uuid,
    channel: input.channel,
  })

  const action_log = await upsert_room_discord_action_log({
    channel_id: process.env.DISCORD_ACTION_CHANNEL_ID ?? null,
    existing_post_id: row.discord_action_post_id,
    existing_thread_id: row.discord_action_thread_id,
    content: discord_log_content_request(row.room_uuid),
  })

  if (action_log) {
    await persist_discord_tracking({
      room_uuid: row.room_uuid,
      discord_action_post_id: action_log.discord_action_post_id,
      discord_action_thread_id: action_log.discord_action_thread_id,
    })
  }

  const refreshed = await load_room_row(row.room_uuid)

  return {
    ok: true,
    mode: parse_room_mode(refreshed?.mode),
    assigned_admin_uuid: refreshed?.assigned_admin_uuid ?? null,
  }
}

export async function room_mode_accept_concierge(input: {
  room_uuid: string
  admin_user_uuid: string
  admin_display_name: string | null
  channel: chat_channel
  locale: chat_locale
}): Promise<room_mode_action_result> {
  const row = await load_room_row(input.room_uuid)

  if (!row) {
    return { ok: false, error: 'room_not_found' }
  }

  if (!room_mode_can_accept_concierge(to_gate(row))) {
    return { ok: false, error: 'invalid_transition' }
  }

  const handles = await load_room_archive_handles(input.room_uuid)

  if (!handles) {
    return { ok: false, error: 'room_not_found' }
  }

  const now = new Date().toISOString()

  const update = await supabase
    .from('rooms')
    .update({
      assigned_admin_uuid: input.admin_user_uuid,
      concierge_accepted_at: now,
      updated_at: now,
    })
    .eq('room_uuid', row.room_uuid)

  if (update.error) {
    throw update.error
  }

  const bundle = build_room_mode_admin_accepted_bundle({
    admin_display_name: input.admin_display_name ?? 'Admin',
    locale: input.locale,
  })

  await archive_message_bundles({
    room_uuid: input.room_uuid,
    participant_uuid: handles.participant_uuid,
    bot_participant_uuid: handles.bot_participant_uuid,
    channel: input.channel,
    bundles: [bundle],
  })

  const log_label = `${input.admin_display_name?.trim() || 'Admin'} accepted`

  const action_log = await upsert_room_discord_action_log({
    channel_id: process.env.DISCORD_ACTION_CHANNEL_ID ?? null,
    existing_post_id: row.discord_action_post_id,
    existing_thread_id: row.discord_action_thread_id,
    content: log_label,
  })

  if (action_log) {
    await persist_discord_tracking({
      room_uuid: row.room_uuid,
      discord_action_post_id: action_log.discord_action_post_id,
      discord_action_thread_id: action_log.discord_action_thread_id,
    })
  }

  const refreshed = await load_room_row(row.room_uuid)

  return {
    ok: true,
    mode: parse_room_mode(refreshed?.mode),
    assigned_admin_uuid: refreshed?.assigned_admin_uuid ?? null,
  }
}

export async function room_mode_resume_bot(input: {
  chat_room: chat_room
  channel: chat_channel
  locale: chat_locale
}): Promise<room_mode_action_result> {
  const row = await load_room_row(input.chat_room.room_uuid)

  if (!row) {
    return { ok: false, error: 'room_not_found' }
  }

  if (!room_mode_can_resume_bot(to_gate(row))) {
    return { ok: false, error: 'invalid_transition' }
  }

  const now = new Date().toISOString()

  const update = await supabase
    .from('rooms')
    .update({
      mode: 'bot',
      assigned_admin_uuid: null,
      bot_resumed_at: now,
      updated_at: now,
    })
    .eq('room_uuid', row.room_uuid)

  if (update.error) {
    throw update.error
  }

  const notice = build_room_mode_notice_bundle({
    notice: 'resumed_bot',
    locale: input.locale,
  })

  await archive_message_bundles({
    room_uuid: input.chat_room.room_uuid,
    participant_uuid: input.chat_room.participant_uuid,
    bot_participant_uuid: input.chat_room.bot_participant_uuid,
    channel: input.channel,
    bundles: [notice],
  })

  const action_log = await upsert_room_discord_action_log({
    channel_id: process.env.DISCORD_ACTION_CHANNEL_ID ?? null,
    existing_post_id: row.discord_action_post_id,
    existing_thread_id: row.discord_action_thread_id,
    content: 'Returned to bot',
  })

  if (action_log) {
    await persist_discord_tracking({
      room_uuid: row.room_uuid,
      discord_action_post_id: action_log.discord_action_post_id,
      discord_action_thread_id: action_log.discord_action_thread_id,
    })
  }

  const refreshed = await load_room_row(row.room_uuid)

  return {
    ok: true,
    mode: parse_room_mode(refreshed?.mode),
    assigned_admin_uuid: refreshed?.assigned_admin_uuid ?? null,
  }
}

/**
 * Admin forces bot mode using room_uuid only (no visitor chat_room).
 */
export async function room_mode_resume_bot_for_room(input: {
  room_uuid: string
  channel: chat_channel
  locale: chat_locale
}): Promise<room_mode_action_result> {
  const handles = await load_room_archive_handles(input.room_uuid)

  if (!handles) {
    return { ok: false, error: 'room_not_found' }
  }

  const row = await load_room_row(input.room_uuid)

  if (!row) {
    return { ok: false, error: 'room_not_found' }
  }

  const synthetic_room: chat_room = {
    room_uuid: input.room_uuid,
    participant_uuid: handles.participant_uuid,
    bot_participant_uuid: handles.bot_participant_uuid,
    user_uuid: handles.user_uuid,
    visitor_uuid: handles.visitor_uuid,
    channel: input.channel,
    mode: parse_room_mode(row.mode),
    assigned_admin_uuid: row.assigned_admin_uuid ?? null,
  }

  return room_mode_resume_bot({
    chat_room: synthetic_room,
    channel: input.channel,
    locale: input.locale,
  })
}
