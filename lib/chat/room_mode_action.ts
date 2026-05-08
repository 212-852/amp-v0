import 'server-only'

import { cookies, headers } from 'next/headers'

import {
  infer_source_channel_from_ua,
  read_session,
  type browser_session_source_channel,
} from '@/lib/auth/session'
import { supabase } from '@/lib/db/supabase'
import { send_action_trace } from '@/lib/debug/action'
import { sync_room_action_context } from '@/lib/notify'
import { normalize_locale } from '@/lib/locale/action'
import { browser_channel_cookie_name } from '@/lib/visitor/cookie'
import { archive_message_bundles } from './archive'
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
  }
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

async function persist_action_id(input: {
  room_uuid: string
  action_id: string | null
}) {
  const result = await supabase
    .from('rooms')
    .update({
      action_id: input.action_id,
      updated_at: new Date().toISOString(),
    })
    .eq('room_uuid', input.room_uuid)

  if (result.error) {
    throw result.error
  }

  if (input.action_id?.startsWith('discord:')) {
    console.log('[chat] discord_action_id_saved', {
      room_uuid: input.room_uuid,
      action_id: input.action_id,
    })
    await send_action_trace('discord_action_id_saved', {
      room_uuid: input.room_uuid,
      action_id: input.action_id,
    })
  }
}

async function update_room_participant_statuses(input: {
  room_uuid: string
  mode: room_mode
  admin_user_uuid?: string | null
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

  const staff_status = input.admin_user_uuid ? 'idle' : 'handling'
  const staff_result = await supabase
    .from('participants')
    .update({
      status: staff_status,
      updated_at: now,
    })
    .eq('room_uuid', input.room_uuid)
    .in('role', ['admin', 'concierge'])

  if (staff_result.error) {
    throw staff_result.error
  }

  if (!input.admin_user_uuid) {
    return
  }

  const admin_result = await supabase
    .from('participants')
    .update({
      status: 'handling',
      updated_at: now,
    })
    .eq('room_uuid', input.room_uuid)
    .eq('user_uuid', input.admin_user_uuid)
    .in('role', ['admin', 'concierge'])

  if (admin_result.error) {
    throw admin_result.error
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

async function load_display_name(user_uuid: string | null) {
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

export type room_mode_action_result =
  | { ok: true; mode: room_mode }
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

  if (parse_room_mode(row.mode) === 'concierge') {
    return {
      ok: true,
      mode: 'concierge',
    }
  }

  if (!room_mode_can_request_concierge(to_gate(row))) {
    return { ok: false, error: 'invalid_transition' }
  }

  const now = new Date().toISOString()
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

  const update = await supabase
    .from('rooms')
    .update({
      mode: 'concierge',
      updated_at: now,
    })
    .eq('room_uuid', row.room_uuid)

  if (update.error) {
    throw update.error
  }

  await update_room_participant_statuses({
    room_uuid: row.room_uuid,
    mode: 'concierge',
  })

  const display_name = await load_display_name(input.chat_room.user_uuid)
  const action_context = await sync_room_action_context({
    provider: 'discord',
    title: action_title({
      display_name,
      room_uuid: row.room_uuid,
    }),
    action_id: row.action_id,
    content: action_content({
      room_uuid: row.room_uuid,
      visitor_uuid: input.chat_room.visitor_uuid,
      user_uuid: input.chat_room.user_uuid,
      channel: input.channel,
      mode: 'concierge',
      requested_at: now,
      timeline: row.action_id
        ? ['Concierge requested again']
        : ['Concierge requested'],
    }),
  })

  if (action_context?.action_id) {
    await persist_action_id({
      room_uuid: row.room_uuid,
      action_id: action_context.action_id,
    })
  }

  const refreshed = await load_room_row(row.room_uuid)

  return {
    ok: true,
    mode: parse_room_mode(refreshed?.mode),
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
      updated_at: now,
    })
    .eq('room_uuid', row.room_uuid)

  if (update.error) {
    throw update.error
  }

  await update_room_participant_statuses({
    room_uuid: row.room_uuid,
    mode: 'concierge',
    admin_user_uuid: input.admin_user_uuid,
  })

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

  const display_name = await load_display_name(handles.user_uuid)
  const action_context = await sync_room_action_context({
    provider: 'discord',
    title: action_title({
      display_name,
      room_uuid: row.room_uuid,
    }),
    action_id: row.action_id,
    content: action_content({
      room_uuid: row.room_uuid,
      visitor_uuid: handles.visitor_uuid,
      user_uuid: handles.user_uuid,
      channel: input.channel,
      mode: 'concierge',
      requested_at: null,
      timeline: [log_label],
    }),
  })

  if (action_context?.action_id) {
    await persist_action_id({
      room_uuid: row.room_uuid,
      action_id: action_context.action_id,
    })
  }

  const refreshed = await load_room_row(row.room_uuid)

  return {
    ok: true,
    mode: parse_room_mode(refreshed?.mode),
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

  if (parse_room_mode(row.mode) === 'bot') {
    return {
      ok: true,
      mode: 'bot',
    }
  }

  if (!room_mode_can_resume_bot(to_gate(row))) {
    return { ok: false, error: 'invalid_transition' }
  }

  const now = new Date().toISOString()
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

  const update = await supabase
    .from('rooms')
    .update({
      mode: 'bot',
      updated_at: now,
    })
    .eq('room_uuid', row.room_uuid)

  if (update.error) {
    throw update.error
  }

  await update_room_participant_statuses({
    room_uuid: row.room_uuid,
    mode: 'bot',
  })

  const display_name = await load_display_name(input.chat_room.user_uuid)
  const action_context = await sync_room_action_context({
    provider: 'discord',
    title: action_title({
      display_name,
      room_uuid: row.room_uuid,
    }),
    action_id: row.action_id,
    content: action_content({
      room_uuid: row.room_uuid,
      visitor_uuid: input.chat_room.visitor_uuid,
      user_uuid: input.chat_room.user_uuid,
      channel: input.channel,
      mode: 'bot',
      requested_at: null,
      timeline: ['Concierge requested', 'Returned to bot'],
    }),
  })

  if (action_context?.action_id) {
    await persist_action_id({
      room_uuid: row.room_uuid,
      action_id: action_context.action_id,
    })
  }

  const refreshed = await load_room_row(row.room_uuid)

  return {
    ok: true,
    mode: parse_room_mode(refreshed?.mode),
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
  }

  return room_mode_resume_bot({
    chat_room: synthetic_room,
    channel: input.channel,
    locale: input.locale,
  })
}

function resolve_session_source_channel(
  browser_channel_cookie: string | null,
  user_agent: string | null,
): browser_session_source_channel {
  const raw = browser_channel_cookie?.trim().toLowerCase()

  if (raw === 'liff' || raw === 'pwa') {
    return raw
  }

  return infer_source_channel_from_ua(user_agent)
}

function session_source_to_chat_channel(
  src: browser_session_source_channel,
): chat_channel {
  if (src === 'web') {
    return 'web'
  }

  return src
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

export async function handle_room_mode_switch_request(request: Request) {
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
  const session_src = resolve_session_source_channel(
    cookie_store.get(browser_channel_cookie_name)?.value ?? null,
    header_store.get('user-agent'),
  )
  const channel = session_source_to_chat_channel(session_src)
  const locale = normalize_locale(
    header_store.get('accept-language')?.split(',')[0],
  ) as chat_locale
  const visitor_uuid = session.visitor_uuid
  const user_uuid = await resolve_visitor_user_uuid(visitor_uuid)
  const room_result = await import('./room').then(({ resolve_chat_room }) =>
    resolve_chat_room({
      visitor_uuid,
      user_uuid,
      channel,
    }),
  )

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

  const result =
    body.mode === 'concierge'
      ? await room_mode_request_concierge({
          chat_room: room_result.room,
          channel,
          locale,
        })
      : await room_mode_resume_bot({
          chat_room: room_result.room,
          channel,
          locale,
        })

  return {
    status: result.ok ? 200 : 400,
    body: result,
  }
}
