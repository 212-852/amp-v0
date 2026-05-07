import 'server-only'

import { cookies, headers } from 'next/headers'

import {
  infer_source_channel_from_ua,
  type browser_session_source_channel,
} from '@/lib/auth/session'
import { get_request_visitor_uuid } from '@/lib/visitor/request_uuid'
import { supabase } from '@/lib/db/supabase'
import { debug_event } from '@/lib/debug'
import {
  archive_incoming_line_text,
  archive_message_bundles,
  has_initial_messages,
  load_archived_messages,
  type archived_message,
} from './archive'
import {
  web_chat_timeline_visibility,
  type web_timeline_filtered_row,
} from './web_timeline'
import { resolve_chat_context } from '@/lib/dispatch/context'
import {
  build_initial_chat_bundles,
  build_line_followup_ack_bundle,
  build_room_mode_notice_bundle,
  build_room_mode_switch_bundle,
  build_user_text_bundle,
} from './message'
import type { chat_locale } from './message'
import { sync_room_action_context } from '@/lib/notify'
import { normalize_locale } from '@/lib/locale/action'
import {
  ensure_direct_room_for_visitor,
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
  locale: chat_locale
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

type user_page_debug_extras = {
  raw_count?: number
  visible_count?: number
  filtered_out?: web_timeline_filtered_row[]
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
  payload: Partial<user_page_debug_payload> & user_page_debug_extras,
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

  const timeline_extras: user_page_debug_extras = {}

  if (payload.raw_count !== undefined) {
    timeline_extras.raw_count = payload.raw_count
  }

  if (payload.visible_count !== undefined) {
    timeline_extras.visible_count = payload.visible_count
  }

  if (payload.filtered_out !== undefined) {
    timeline_extras.filtered_out = payload.filtered_out
  }

  await debug_event({
    category: 'USER_PAGE',
    event,
    payload: {
      ...safe_payload,
      ...timeline_extras,
      error: serialize_error(safe_payload.error),
    },
  })
}

async function emit_user_page_message_fetch_completed(
  base: Omit<
    Partial<user_page_debug_payload>,
    'message_count' | 'error'
  >,
  archived_messages: archived_message[],
) {
  const { raw_count, visible_count, filtered_out } =
    web_chat_timeline_visibility(archived_messages)

  await emit_user_page_debug('message_fetch_completed', {
    ...base,
    message_count: raw_count,
    raw_count,
    visible_count,
    filtered_out,
  })

  if (raw_count > visible_count) {
    console.error('[USER_PAGE] message_fetch_visible_gap', {
      raw_count,
      visible_count,
      filtered: filtered_out,
    })
  }
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
      locale: input.locale,
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
      locale: input.locale,
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
          locale: input.locale,
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
        locale: input.locale,
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
      locale: input.locale,
    }
  }

  try {
    if (input.channel === 'line' && !input.line_reply_token?.trim()) {
      return {
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: archived_messages,
        locale: input.locale,
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
        locale: input.locale,
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
      locale: input.locale,
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
      locale: input.locale,
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
    },
    is_new_room: false,
    is_seeded: false,
    messages: [],
    locale: 'ja',
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

    if (chat_context.is_new_visitor) {
      await ensure_direct_room_for_visitor({
        visitor_uuid,
        user_uuid,
        channel: source_channel,
      })
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

    await emit_user_page_message_fetch_completed(
      {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        locale,
      },
      archived_messages,
    )

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
        locale,
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

    await emit_user_page_message_fetch_completed(
      {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        locale,
      },
      final_messages,
    )

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
        locale,
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
      locale,
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
      message_uuid: string | null
      messages: archived_message[]
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

function switch_step_log(
  event: string,
  step_anchor: { t: number },
  payload: Record<string, unknown> = {},
) {
  const now = Date.now()
  console.log('[chat]', event, {
    ...payload,
    duration_ms: now - step_anchor.t,
  })
  step_anchor.t = now
}

function switch_action_content(input: {
  room_uuid: string
  visitor_uuid: string
  user_uuid: string | null
  channel: chat_channel
  mode: room_mode
  requested_at: string
  timeline: string[]
}) {
  return [
    `room_uuid: ${input.room_uuid}`,
    `visitor_uuid: ${input.visitor_uuid}`,
    `user_uuid: ${input.user_uuid ?? ''}`,
    `channel: ${input.channel}`,
    `mode: ${input.mode}`,
    `requested_at: ${input.requested_at}`,
    '',
    'Timeline:',
    ...input.timeline.map((item) => `- ${item}`),
  ].join('\n')
}

async function sync_concierge_switch_action(input: {
  room_uuid: string
  visitor_uuid: string
  user_uuid: string | null
  channel: chat_channel
  action_id: string | null
}) {
  try {
    const action_context = await sync_room_action_context({
      provider: 'discord',
      title: `Concierge: ${input.room_uuid}`,
      action_id: input.action_id,
      content: switch_action_content({
        room_uuid: input.room_uuid,
        visitor_uuid: input.visitor_uuid,
        user_uuid: input.user_uuid,
        channel: input.channel,
        mode: 'concierge',
        requested_at: new Date().toISOString(),
        timeline: input.action_id
          ? ['Concierge requested again']
          : ['Concierge requested'],
      }),
    })

    if (!action_context?.action_id) {
      return
    }

    if (action_context.action_id === input.action_id) {
      return
    }

    const result = await supabase
      .from('rooms')
      .update({
        action_id: action_context.action_id,
        updated_at: new Date().toISOString(),
      })
      .eq('room_uuid', input.room_uuid)

    if (result.error) {
      throw result.error
    }
  } catch (error) {
    console.error('[chat]', 'concierge_action_sync_failed', {
      room_uuid: input.room_uuid,
      error: serialize_error(error),
    })
  }
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

export async function handle_chat_mode_request(
  request: Request,
): Promise<{ status: number; body: room_mode_switch_result }> {
  const step_anchor = { t: Date.now() }
  switch_step_log('switch_api_started', step_anchor, {})

  const visitor_uuid = await get_request_visitor_uuid()

  if (!visitor_uuid) {
    return {
      status: 401,
      body: { ok: false, error: 'session_required' },
    }
  }

  const body = (await request.json().catch(() => null)) as {
    room_uuid?: string
    participant_uuid?: string
    locale?: string
    mode?: room_mode
  } | null

  if (
    !body?.room_uuid ||
    !body.participant_uuid ||
    (body.mode !== 'bot' && body.mode !== 'concierge')
  ) {
    return {
      status: 400,
      body: { ok: false, error: 'invalid_mode' },
    }
  }

  const header_store = await headers()
  const cookie_store = await cookies()
  const user_agent = header_store.get('user-agent')
  const source_channel = resolve_session_source_channel(
    cookie_store.get(browser_channel_cookie_name)?.value ?? null,
    infer_source_channel_from_ua(user_agent),
    user_agent,
  )
  const channel = session_source_to_chat_channel(source_channel)
  const locale = normalize_locale(body.locale) as chat_locale
  const incoming_bundle = build_room_mode_switch_bundle({
    mode: body.mode,
    locale,
  })
  const switch_action = resolve_chat_message_action(incoming_bundle)

  if (switch_action.action !== 'switch_room_mode') {
    return {
      status: 400,
      body: { ok: false, error: 'invalid_transition' },
    }
  }

  const participant_result = await supabase
    .from('participants')
    .select('participant_uuid, room_uuid, visitor_uuid, user_uuid')
    .eq('participant_uuid', body.participant_uuid)
    .eq('room_uuid', body.room_uuid)
    .eq('role', 'user')
    .maybeSingle()

  if (participant_result.error) {
    throw participant_result.error
  }

  if (
    !participant_result.data ||
    participant_result.data.visitor_uuid !== visitor_uuid
  ) {
    return {
      status: 403,
      body: { ok: false, error: 'room_mismatch' },
    }
  }

  const bot_participant_result = await supabase
    .from('participants')
    .select('participant_uuid')
    .eq('room_uuid', body.room_uuid)
    .eq('role', 'bot')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (bot_participant_result.error) {
    throw bot_participant_result.error
  }

  if (!bot_participant_result.data?.participant_uuid) {
    return {
      status: 404,
      body: { ok: false, error: 'room_not_found' },
    }
  }

  const chat_room: chat_room = {
    room_uuid: body.room_uuid,
    participant_uuid: body.participant_uuid,
    bot_participant_uuid: bot_participant_result.data.participant_uuid,
    user_uuid: participant_result.data.user_uuid ?? null,
    visitor_uuid,
    channel,
    mode: switch_action.mode,
  }

  const update_started_at = Date.now()
  const room_update = await supabase
    .from('rooms')
    .update({
      mode: switch_action.mode,
      updated_at: new Date().toISOString(),
    })
    .eq('room_uuid', body.room_uuid)
    .select('mode, action_id')
    .maybeSingle()

  if (room_update.error) {
    throw room_update.error
  }

  if (!room_update.data) {
    return {
      status: 404,
      body: { ok: false, error: 'room_not_found' },
    }
  }

  switch_step_log('mode_updated', step_anchor, {
    room_uuid: chat_room.room_uuid,
    mode: room_update.data.mode,
    step_duration_ms: Date.now() - update_started_at,
  })

  const chat_room_after_mode: chat_room = {
    ...chat_room,
    mode: parse_room_mode(room_update.data.mode),
  }

  const confirmation_bundle = build_room_mode_notice_bundle({
    notice:
      switch_action.mode === 'concierge'
        ? 'concierge_requested'
        : 'resumed_bot',
    locale,
  })
  const archived_messages = await archive_message_bundles({
    room_uuid: chat_room_after_mode.room_uuid,
    participant_uuid: chat_room_after_mode.participant_uuid,
    bot_participant_uuid: chat_room_after_mode.bot_participant_uuid,
    channel,
    bundles: [incoming_bundle, confirmation_bundle],
  })
  switch_step_log('incoming_archived', step_anchor, {
    room_uuid: chat_room_after_mode.room_uuid,
    message_uuid: archived_messages[0]?.archive_uuid ?? null,
  })
  switch_step_log('outgoing_archived', step_anchor, {
    room_uuid: chat_room_after_mode.room_uuid,
    message_uuid: archived_messages[1]?.archive_uuid ?? null,
  })

  await output_chat_bundles({
    room: chat_room_after_mode,
    channel,
    messages: archived_messages,
  })

  if (chat_room_after_mode.mode === 'concierge') {
    await sync_concierge_switch_action({
      room_uuid: chat_room_after_mode.room_uuid,
      visitor_uuid: chat_room_after_mode.visitor_uuid,
      user_uuid: chat_room_after_mode.user_uuid,
      channel,
      action_id:
        typeof room_update.data.action_id === 'string'
          ? room_update.data.action_id
          : null,
    })
  }

  switch_step_log('switch_api_completed', step_anchor, {
    room_uuid: chat_room_after_mode.room_uuid,
    mode: chat_room_after_mode.mode,
    message_count: archived_messages.length,
  })

  return {
    status: 200,
    body: {
      ok: true,
      mode: chat_room_after_mode.mode,
      message_uuid: archived_messages[0]?.archive_uuid ?? null,
      messages: archived_messages,
    },
  }
}
