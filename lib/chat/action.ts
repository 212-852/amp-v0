import 'server-only'

import { cookies, headers } from 'next/headers'

import {
  infer_source_channel_from_ua,
  read_session,
  type browser_session_source_channel,
} from '@/lib/auth/session'
import { supabase } from '@/lib/db/supabase'
import { debug_event } from '@/lib/debug'
import { upsert_discord_action_post } from '@/lib/discord/action'
import {
  archive_incoming_line_text,
  archive_message_bundles,
  has_initial_messages,
  load_archived_messages,
  type archived_message,
} from './archive'
import { resolve_chat_context } from '@/lib/dispatch/context'
import {
  build_initial_chat_bundles,
  build_line_followup_ack_bundle,
  build_room_mode_switch_bundle,
  build_user_text_bundle,
} from './message'
import type { chat_locale } from './message'
import { normalize_locale } from '@/lib/locale/action'
import {
  load_room_row,
  parse_room_mode,
  resolve_chat_room,
  type chat_channel,
  type chat_room,
  type room_mode,
} from './room'
import {
  resolve_chat_message_action,
  should_seed_initial_messages,
} from './rules'
import {
  room_mode_can_request_concierge,
  room_mode_can_resume_bot,
  type room_mode_gate_row,
} from './room_mode_rules'
import { output_chat_bundles } from '@/lib/output'
import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

type resolve_initial_chat_input = {
  visitor_uuid: string
  user_uuid?: string | null
  channel: chat_channel
  locale: chat_locale
  external_room_id?: string | null
  line_reply_token?: string | null
  line_user_id?: string | null
  incoming_line_text?: {
    text: string
    line_message_id: string
    created_at: string
    webhook_event_id?: string | null
    delivery_context_redelivery?: boolean | null
  } | null
}

export type initial_chat_result = {
  room: chat_room
  is_new_room: boolean
  is_seeded: boolean
  messages: archived_message[]
}

type user_page_debug_payload = {
  user_uuid: string | null
  visitor_uuid: string | null
  room_uuid: string | null
  participant_uuid: string | null
  source_channel: chat_channel
  locale: chat_locale
  message_count: number
  has_initial_messages: boolean | null
  error: unknown
}

function serialize_error(error: unknown): Record<string, unknown> | null {
  if (!error) {
    return null
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        typeof error.cause === 'object' && error.cause !== null
          ? error.cause
          : undefined,
    }
  }

  if (typeof error === 'object') {
    try {
      return JSON.parse(JSON.stringify(error)) as Record<string, unknown>
    } catch {
      return { value: String(error) }
    }
  }

  return { value: String(error) }
}

async function emit_user_page_debug(
  event: string,
  payload: Partial<user_page_debug_payload>,
) {
  const safe_payload: user_page_debug_payload = {
    user_uuid: payload.user_uuid ?? null,
    visitor_uuid: payload.visitor_uuid ?? null,
    room_uuid: payload.room_uuid ?? null,
    participant_uuid: payload.participant_uuid ?? null,
    source_channel: payload.source_channel ?? 'web',
    locale: payload.locale ?? 'ja',
    message_count: payload.message_count ?? 0,
    has_initial_messages: payload.has_initial_messages ?? null,
    error: payload.error ?? null,
  }

  await debug_event({
    category: 'USER_PAGE',
    event,
    payload: {
      ...safe_payload,
      error: serialize_error(safe_payload.error),
    },
  })
}

async function archive_input_line_text_for_room(input: {
  room: chat_room
  locale: chat_locale
  line_user_id?: string | null
  incoming_line_text?: resolve_initial_chat_input['incoming_line_text']
}) {
  if (!input.line_user_id || !input.incoming_line_text) {
    return null
  }

  return archive_incoming_line_text({
    room_uuid: input.room.room_uuid,
    participant_uuid: input.room.participant_uuid,
    user_uuid: input.room.user_uuid,
    visitor_uuid: input.room.visitor_uuid,
    line_user_id: input.line_user_id,
    line_message_id: input.incoming_line_text.line_message_id,
    text: input.incoming_line_text.text,
    created_at: input.incoming_line_text.created_at,
    webhook_event_id:
      input.incoming_line_text.webhook_event_id ?? null,
    delivery_context_redelivery:
      input.incoming_line_text.delivery_context_redelivery ?? null,
    bundle: build_user_text_bundle({
      text: input.incoming_line_text.text,
      locale: input.locale,
      content_key: 'line.incoming.text',
    }),
  })
}

export async function resolve_initial_chat(
  input: resolve_initial_chat_input,
): Promise<initial_chat_result> {
  const room_result = await resolve_chat_room({
    visitor_uuid: input.visitor_uuid,
    user_uuid: input.user_uuid ?? null,
    channel: input.channel,
    external_room_id: input.external_room_id ?? null,
  })

  if (!room_result.ok || !room_result.room.room_uuid) {
    return {
      room: room_result.room,
      is_new_room: false,
      is_seeded: false,
      messages: [],
    }
  }

  let archived_messages: archived_message[]

  try {
    archived_messages = await load_archived_messages(
      room_result.room.room_uuid,
    )
  } catch (error) {
    const e = error as { code?: string; message?: string }
    console.error('[chat_room]', 'room_failed', 'load_archived_messages', {
      error,
      error_code: e.code,
      error_message: e.message,
      room_uuid: room_result.room.room_uuid,
    })

    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: false,
      messages: [],
    }
  }

  const room_has_initial_messages = await has_initial_messages(
    room_result.room.room_uuid,
  )
  const should_seed =
    !room_has_initial_messages &&
    should_seed_initial_messages(archived_messages)

  if (!should_seed) {
    if (
      input.channel === 'line' &&
      input.line_reply_token &&
      input.line_user_id &&
      input.incoming_line_text
    ) {
      const archived_incoming = await archive_input_line_text_for_room({
        room: room_result.room,
        locale: input.locale,
        line_user_id: input.line_user_id,
        incoming_line_text: input.incoming_line_text,
      })

      if (archived_incoming?.is_duplicate) {
        return {
          room: room_result.room,
          is_new_room: room_result.is_new_room,
          is_seeded: false,
          messages: await load_archived_messages(
            room_result.room.room_uuid,
          ),
        }
      }

      const ack_bundles = [
        build_line_followup_ack_bundle({ locale: input.locale }),
      ]
      const outgoing = await archive_message_bundles({
        room_uuid: room_result.room.room_uuid,
        participant_uuid: room_result.room.participant_uuid,
        bot_participant_uuid: room_result.room.bot_participant_uuid,
        channel: 'line',
        bundles: ack_bundles,
      })

      await output_chat_bundles({
        room: room_result.room,
        channel: 'line',
        messages: outgoing,
        line_reply_token: input.line_reply_token,
        line_user_id: input.line_user_id ?? null,
      })

      return {
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: await load_archived_messages(
          room_result.room.room_uuid,
        ),
      }
    }

    if (
      input.channel === 'line' &&
      input.line_user_id &&
      input.incoming_line_text
    ) {
      await archive_input_line_text_for_room({
        room: room_result.room,
        locale: input.locale,
        line_user_id: input.line_user_id,
        incoming_line_text: input.incoming_line_text,
      })
    }

    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: false,
      messages: await load_archived_messages(
        room_result.room.room_uuid,
      ),
    }
  }

  try {
    if (input.channel === 'line' && !input.line_reply_token?.trim()) {
      return {
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: archived_messages,
      }
    }

    const archived_incoming =
      input.channel === 'line'
        ? await archive_input_line_text_for_room({
            room: room_result.room,
            locale: input.locale,
            line_user_id: input.line_user_id,
            incoming_line_text: input.incoming_line_text,
          })
        : null

    if (archived_incoming?.is_duplicate) {
      return {
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: await load_archived_messages(
          room_result.room.room_uuid,
        ),
      }
    }

    const bundles = build_initial_chat_bundles({
      locale: input.locale,
    })
    const seeded_messages = await archive_message_bundles({
      room_uuid: room_result.room.room_uuid,
      participant_uuid: room_result.room.participant_uuid,
      bot_participant_uuid: room_result.room.bot_participant_uuid,
      channel: input.channel,
      bundles,
    })

    await output_chat_bundles({
      room: room_result.room,
      channel: input.channel,
      messages: seeded_messages,
      line_reply_token: input.line_reply_token ?? null,
      line_user_id: input.line_user_id ?? null,
    })

    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: true,
      messages: [
        ...(archived_incoming?.archived_message
          ? [archived_incoming.archived_message]
          : []),
        ...seeded_messages,
      ],
    }
  } catch (error) {
    const e = error as { code?: string; message?: string }
    console.error('[chat_room]', 'room_failed', 'seed_initial_messages', {
      error,
      error_code: e.code,
      error_message: e.message,
      room_uuid: room_result.room.room_uuid,
    })

    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: false,
      messages: archived_messages,
    }
  }
}

export async function load_user_home_chat() {
  const fallback_result: initial_chat_result = {
    room: {
      room_uuid: '',
      participant_uuid: '',
      bot_participant_uuid: '',
      user_uuid: null,
      visitor_uuid: '',
      channel: 'web' as const,
      mode: 'bot' as const,
      assigned_admin_uuid: null,
    },
    is_new_room: false,
    is_seeded: false,
    messages: [],
  }

  await emit_user_page_debug('render_started', {})

  try {
    const chat_context = await resolve_chat_context({
      channel: 'web',
    })
    const visitor_uuid = chat_context.visitor_uuid
    const user_uuid = chat_context.user_uuid ?? null
    const source_channel = chat_context.channel
    const locale = chat_context.locale

    await emit_user_page_debug('session_resolved', {
      user_uuid,
      visitor_uuid,
      source_channel,
      locale,
    })

    if (!visitor_uuid) {
      await emit_user_page_debug('render_failed', {
        user_uuid,
        visitor_uuid: null,
        source_channel,
        locale,
        error: {
          message: 'visitor_uuid_missing',
        },
      })

      return fallback_result
    }

    await emit_user_page_debug('room_resolve_started', {
      user_uuid,
      visitor_uuid,
      source_channel,
      locale,
    })

    const room_result = await resolve_chat_room({
      visitor_uuid,
      user_uuid,
      channel: source_channel,
    })

    if (!room_result.ok || !room_result.room.room_uuid) {
      await emit_user_page_debug('render_failed', {
        user_uuid,
        visitor_uuid,
        source_channel,
        locale,
        error: {
          message: 'room_resolve_failed',
          room_ok: room_result.ok,
        },
      })

      return fallback_result
    }

    const room = room_result.room

    await emit_user_page_debug('room_resolve_completed', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
    })

    await emit_user_page_debug('message_fetch_started', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
    })

    const archived_messages = await load_archived_messages(room.room_uuid)

    await emit_user_page_debug('message_fetch_completed', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
      message_count: archived_messages.length,
    })

    await emit_user_page_debug('initial_seed_check_started', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
      message_count: archived_messages.length,
    })

    const room_has_initial_messages = await has_initial_messages(
      room.room_uuid,
    )

    if (archived_messages.length > 0) {
      await emit_user_page_debug('initial_seed_skipped', {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        locale,
        message_count: archived_messages.length,
        has_initial_messages: room_has_initial_messages,
      })

      await emit_user_page_debug('render_completed', {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        locale,
        message_count: archived_messages.length,
        has_initial_messages: room_has_initial_messages,
      })

      return {
        room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: archived_messages,
      }
    }

    const bundles = build_initial_chat_bundles({ locale })
    await archive_message_bundles({
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      bot_participant_uuid: room.bot_participant_uuid,
      channel: source_channel,
      bundles,
    })

    const final_messages = await load_archived_messages(room.room_uuid)

    await emit_user_page_debug('initial_seed_created', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
      message_count: final_messages.length,
      has_initial_messages: room_has_initial_messages,
    })

    if (final_messages.length === 0) {
      await emit_user_page_debug('render_failed', {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        locale,
        message_count: 0,
        has_initial_messages: room_has_initial_messages,
        error: { message: 'empty_messages_after_seed' },
      })

      return {
        room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: [],
      }
    }

    await emit_user_page_debug('render_completed', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
      message_count: final_messages.length,
      has_initial_messages: room_has_initial_messages,
    })

    return {
      room,
      is_new_room: room_result.is_new_room,
      is_seeded: true,
      messages: final_messages,
    }
  } catch (error) {
    await emit_user_page_debug('render_failed', {
      error,
    })

    return fallback_result
  }
}

type room_mode_switch_result =
  | {
      ok: true
      mode: room_mode
      assigned_admin_uuid: string | null
      message_uuid: string | null
    }
  | {
      ok: false
      error:
        | 'session_required'
        | 'invalid_mode'
        | 'room_not_found'
        | 'room_mismatch'
        | 'invalid_transition'
    }

type switch_room_mode_action_result =
  | {
      ok: true
      mode: room_mode
      assigned_admin_uuid: string | null
    }
  | {
      ok: false
      error: 'room_not_found' | 'invalid_transition'
    }

function resolve_session_source_channel(
  browser_channel_cookie: string | null,
  session_channel: browser_session_source_channel,
  user_agent: string | null,
): browser_session_source_channel {
  const raw = browser_channel_cookie?.trim().toLowerCase()

  if (raw === 'liff' || raw === 'pwa') {
    return raw
  }

  if (
    session_channel === 'liff' ||
    session_channel === 'pwa' ||
    session_channel === 'line'
  ) {
    return session_channel
  }

  return infer_source_channel_from_ua(user_agent)
}

function session_source_to_chat_channel(
  source_channel: browser_session_source_channel,
): chat_channel {
  if (source_channel === 'web') {
    return 'web'
  }

  if (source_channel === 'line') {
    return 'liff'
  }

  return source_channel
}

async function resolve_visitor_user_uuid(visitor_uuid: string) {
  const result = await supabase
    .from('visitors')
    .select('user_uuid')
    .eq('visitor_uuid', visitor_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data?.user_uuid ?? null
}

async function load_user_display_name(user_uuid: string | null) {
  if (!user_uuid) {
    return null
  }

  const result = await supabase
    .from('users')
    .select('display_name')
    .eq('user_uuid', user_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  return result.data?.display_name ?? null
}

function action_title(input: {
  display_name: string | null
  room_uuid: string
}) {
  return `Concierge: ${input.display_name?.trim() || input.room_uuid}`
}

function action_content(input: {
  room_uuid: string
  visitor_uuid: string | null
  user_uuid: string | null
  channel: chat_channel
  mode: room_mode
  requested_at: string | null
  timeline: string[]
}) {
  return [
    `room_uuid: ${input.room_uuid}`,
    `visitor_uuid: ${input.visitor_uuid ?? ''}`,
    `user_uuid: ${input.user_uuid ?? ''}`,
    `channel: ${input.channel}`,
    `mode: ${input.mode}`,
    `requested_at: ${input.requested_at ?? ''}`,
    '',
    'Timeline:',
    ...input.timeline.map((item) => `- ${item}`),
  ].join('\n')
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

function room_mode_gate(row: NonNullable<Awaited<ReturnType<typeof load_room_row>>>): room_mode_gate_row {
  return {
    mode: parse_room_mode(row.mode),
    assigned_admin_uuid: row.assigned_admin_uuid ?? null,
  }
}

async function update_room_participant_statuses(input: {
  room_uuid: string
  mode: room_mode
}) {
  const now = new Date().toISOString()

  if (input.mode === 'bot') {
    const bot_result = await supabase
      .from('participants')
      .update({
        status: 'handling',
        updated_at: now,
      })
      .eq('room_uuid', input.room_uuid)
      .eq('role', 'bot')

    if (bot_result.error) {
      throw bot_result.error
    }

    const staff_result = await supabase
      .from('participants')
      .update({
        status: 'idle',
        updated_at: now,
      })
      .eq('room_uuid', input.room_uuid)
      .in('role', ['admin', 'concierge'])

    if (staff_result.error) {
      throw staff_result.error
    }

    return
  }

  const bot_result = await supabase
    .from('participants')
    .update({
      status: 'idle',
      updated_at: now,
    })
    .eq('room_uuid', input.room_uuid)
    .eq('role', 'bot')

  if (bot_result.error) {
    throw bot_result.error
  }

  const staff_result = await supabase
    .from('participants')
    .update({
      status: 'handling',
      updated_at: now,
    })
    .eq('room_uuid', input.room_uuid)
    .in('role', ['admin', 'concierge'])

  if (staff_result.error) {
    throw staff_result.error
  }
}

async function apply_switch_room_mode_action(input: {
  chat_room: chat_room
  channel: chat_channel
  mode: room_mode
}): Promise<switch_room_mode_action_result> {
  const row = await load_room_row(input.chat_room.room_uuid)

  if (!row) {
    return { ok: false, error: 'room_not_found' }
  }

  const current_mode = parse_room_mode(row.mode)

  if (current_mode !== input.mode) {
    const gate = room_mode_gate(row)

    if (
      input.mode === 'concierge' &&
      !room_mode_can_request_concierge(gate)
    ) {
      return { ok: false, error: 'invalid_transition' }
    }

    if (input.mode === 'bot' && !room_mode_can_resume_bot(gate)) {
      return { ok: false, error: 'invalid_transition' }
    }
  }

  const now = new Date().toISOString()
  const update_payload =
    input.mode === 'concierge'
      ? {
          mode: 'concierge' as const,
          assigned_admin_uuid: null,
          concierge_requested_at: now,
          updated_at: now,
        }
      : {
          mode: 'bot' as const,
          assigned_admin_uuid: null,
          bot_resumed_at: now,
          updated_at: now,
        }

  const update = await supabase
    .from('rooms')
    .update(update_payload)
    .eq('room_uuid', row.room_uuid)

  if (update.error) {
    throw update.error
  }

  await update_room_participant_statuses({
    room_uuid: row.room_uuid,
    mode: input.mode,
  })

  const display_name = await load_user_display_name(
    input.chat_room.user_uuid,
  )
  const should_sync_action_post =
    input.mode === 'concierge' ||
    Boolean(row.discord_action_post_id || row.discord_action_thread_id)

  if (should_sync_action_post) {
    const action_log = await upsert_discord_action_post({
      title: action_title({
        display_name,
        room_uuid: row.room_uuid,
      }),
      existing_post_id: row.discord_action_post_id,
      existing_thread_id: row.discord_action_thread_id,
      content: action_content({
        room_uuid: row.room_uuid,
        visitor_uuid: input.chat_room.visitor_uuid,
        user_uuid: input.chat_room.user_uuid,
        channel: input.channel,
        mode: input.mode,
        requested_at:
          input.mode === 'concierge'
            ? now
            : row.concierge_requested_at,
        timeline:
          input.mode === 'concierge'
            ? row.discord_action_post_id
              ? [
                  ...(row.bot_resumed_at ? ['Returned to bot'] : []),
                  'Concierge requested again',
                ]
              : ['Concierge requested']
            : [
                ...(row.concierge_requested_at
                  ? ['Concierge requested']
                  : []),
                'Returned to bot',
              ],
      }),
    })

    if (action_log) {
      await persist_discord_tracking({
        room_uuid: row.room_uuid,
        discord_action_post_id: action_log.discord_action_post_id,
        discord_action_thread_id: action_log.discord_action_thread_id,
      })
    }
  }

  const refreshed = await load_room_row(row.room_uuid)

  return {
    ok: true,
    mode: parse_room_mode(refreshed?.mode),
    assigned_admin_uuid: refreshed?.assigned_admin_uuid ?? null,
  }
}

export async function handle_chat_mode_request(
  request: Request,
): Promise<{ status: number; body: room_mode_switch_result }> {
  const session = await read_session()

  if (!session.visitor_uuid) {
    return {
      status: 401,
      body: { ok: false, error: 'session_required' },
    }
  }

  const body = (await request.json().catch(() => null)) as {
    room_uuid?: string
    mode?: room_mode
  } | null

  if (body?.mode !== 'bot' && body?.mode !== 'concierge') {
    return {
      status: 400,
      body: { ok: false, error: 'invalid_mode' },
    }
  }

  const header_store = await headers()
  const cookie_store = await cookies()
  const source_channel = resolve_session_source_channel(
    cookie_store.get(browser_channel_cookie_name)?.value ?? null,
    session.source_channel,
    header_store.get('user-agent'),
  )
  const channel = session_source_to_chat_channel(source_channel)
  const locale = normalize_locale(
    header_store.get('accept-language')?.split(',')[0],
  ) as chat_locale
  const visitor_uuid = session.visitor_uuid
  const user_uuid = await resolve_visitor_user_uuid(visitor_uuid)
  const room_result = await resolve_chat_room({
    visitor_uuid,
    user_uuid,
    channel,
  })

  if (!room_result.ok || !room_result.room.room_uuid) {
    return {
      status: 404,
      body: { ok: false, error: 'room_not_found' },
    }
  }

  if (body.room_uuid && body.room_uuid !== room_result.room.room_uuid) {
    return {
      status: 403,
      body: { ok: false, error: 'room_mismatch' },
    }
  }

  const switch_bundle = build_room_mode_switch_bundle({
    mode: body.mode,
    locale,
  })
  const archived_messages = await archive_message_bundles({
    room_uuid: room_result.room.room_uuid,
    participant_uuid: room_result.room.participant_uuid,
    bot_participant_uuid: room_result.room.bot_participant_uuid,
    channel,
    bundles: [switch_bundle],
  })
  const rule_action = resolve_chat_message_action(switch_bundle)

  if (rule_action.action !== 'switch_room_mode') {
    return {
      status: 400,
      body: { ok: false, error: 'invalid_mode' },
    }
  }

  const action_result = await apply_switch_room_mode_action({
    chat_room: room_result.room,
    channel,
    mode: rule_action.mode,
  })

  if (!action_result.ok) {
    return {
      status: 400,
      body: action_result,
    }
  }

  await output_chat_bundles({
    room: room_result.room,
    channel,
    messages: archived_messages,
  })

  return {
    status: 200,
    body: {
      ...action_result,
      message_uuid: archived_messages[0]?.archive_uuid ?? null,
    },
  }
}
