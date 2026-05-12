import 'server-only'

import type { notify_event } from './rules'

const discord_api_base = 'https://discord.com/api/v10'

export type discord_action_context_input = {
  title: string
  content: string
  action_id: string | null
  close?: boolean
}

export type discord_action_context_result = {
  action_id: string | null
}

export type discord_notify_result = {
  channel: 'discord'
  action_id?: string | null
  /** When false, the webhook returned a non-2xx response or delivery was skipped. */
  ok?: boolean
  http_status?: number
  error_text?: string | null
}

function action_id_from_discord_thread_id(
  thread_id: string | null | undefined,
) {
  if (!thread_id) {
    return null
  }

  return `discord:${thread_id}`
}

function discord_thread_id_from_action_id(
  action_id: string | null | undefined,
) {
  if (!action_id?.startsWith('discord:')) {
    return null
  }

  const thread_id = action_id.slice('discord:'.length).trim()

  return thread_id || null
}

async function discord_action_bot_fetch(
  path: string,
  init: RequestInit,
) {
  const token = process.env.DISCORD_ACTION_BOT_TOKEN?.trim()
  const url = `${discord_api_base}${path}`

  if (!token) {
    return null
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bot ${token}`,
      ...(init.headers ?? {}),
    },
  })

  return response
}

function discord_action_channel_id() {
  return process.env.DISCORD_ACTION_CHANNEL_ID?.trim() || null
}

/**
 * Optional comma-separated forum tag snowflakes when the action forum channel
 * has REQUIRE_TAG (channel flag). Example: "111,222".
 */
function discord_action_forum_applied_tags(): string[] {
  const raw = process.env.DISCORD_ACTION_FORUM_TAG_IDS?.trim()

  if (!raw) {
    return []
  }

  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

function forum_thread_starter_content(content: string) {
  const trimmed = content.trim()

  if (trimmed.length > 0) {
    return trimmed.length > 2000 ? trimmed.slice(0, 2000) : trimmed
  }

  return '(no content)'
}

function log_discord_action(
  event: string,
  payload: Record<string, unknown> = {},
) {
  console.log('[discord_action]', event, payload)
}

async function create_discord_action_context(input: {
  title: string
  content: string
}): Promise<discord_action_context_result | null> {
  const channel_id = discord_action_channel_id()

  if (!channel_id) {
    console.warn(
      '[discord_action]',
      'thread_create_skipped_missing_channel_id',
    )
    return null
  }

  log_discord_action('discord_action_thread_create_started', {
    channel_id,
    title: input.title,
  })

  const applied_tags = discord_action_forum_applied_tags()
  const starter_body: Record<string, unknown> = {
    name: input.title.slice(0, 100),
    auto_archive_duration: 1440,
    message: {
      content: forum_thread_starter_content(input.content),
    },
  }

  if (applied_tags.length > 0) {
    starter_body.applied_tags = applied_tags
  }

  const response = await discord_action_bot_fetch(
    `/channels/${channel_id}/threads`,
    {
      method: 'POST',
      body: JSON.stringify(starter_body),
    },
  )

  if (!response) {
    console.warn(
      '[discord_action]',
      'thread_create_skipped_missing_bot_token',
    )
    return null
  }

  if (!response.ok) {
    console.warn(
      '[discord_action] create_failed',
      response.status,
      await response.text(),
    )

    return null
  }

  const payload = (await response.json()) as {
    id?: string
    message?: { id?: string }
  }
  const thread_id = payload.id ?? null
  const action_id = action_id_from_discord_thread_id(thread_id)

  if (!thread_id || !action_id) {
    console.warn('[discord_action] create_ok_but_missing_thread_id', {
      payload_keys: payload ? Object.keys(payload) : [],
    })
    return null
  }

  log_discord_action('discord_action_thread_created', {
    channel_id,
    thread_id,
    action_id,
  })

  log_discord_action('discord_action_message_posted', {
    thread_id,
    action_id,
    initial: true,
    starter_message_id: payload.message?.id ?? null,
  })

  return {
    action_id,
  }
}

async function post_discord_action_thread_message(input: {
  thread_id: string
  action_id: string
  content: string
}) {
  const body_content = forum_thread_starter_content(input.content)

  const response = await discord_action_bot_fetch(
    `/channels/${input.thread_id}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: body_content,
      }),
    },
  )

  if (response?.ok) {
    log_discord_action('discord_action_message_posted', {
      thread_id: input.thread_id,
      action_id: input.action_id,
    })
    return true
  }

  if (response && !response.ok) {
    console.warn(
      '[discord_action] thread_append_failed',
      response.status,
      await response.text(),
    )
  }

  return false
}

async function close_discord_action_thread(input: {
  thread_id: string
  action_id: string
}) {
  const response = await discord_action_bot_fetch(
    `/channels/${input.thread_id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        archived: true,
        locked: true,
      }),
    },
  )

  if (response?.ok) {
    log_discord_action('discord_action_closed', {
      thread_id: input.thread_id,
      action_id: input.action_id,
    })
    return true
  }

  if (response && !response.ok) {
    console.warn(
      '[discord_action] close_failed',
      response.status,
      await response.text(),
    )
  }

  return false
}

async function reopen_discord_action_thread(input: {
  thread_id: string
  action_id: string
}) {
  const response = await discord_action_bot_fetch(
    `/channels/${input.thread_id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        archived: false,
        locked: false,
      }),
    },
  )

  if (response?.ok) {
    log_discord_action('discord_action_reopened', {
      thread_id: input.thread_id,
      action_id: input.action_id,
    })
    return true
  }

  if (response && !response.ok) {
    console.warn(
      '[discord_action] reopen_failed',
      response.status,
      await response.text(),
    )
  }

  return false
}

async function update_discord_action_context(input: {
  action_id: string
  content: string
  close?: boolean
}): Promise<discord_action_context_result | null> {
  const thread_id = discord_thread_id_from_action_id(input.action_id)

  if (!thread_id) {
    return null
  }

  if (!input.close) {
    const reopened = await reopen_discord_action_thread({
      thread_id,
      action_id: input.action_id,
    })

    if (!reopened) {
      return null
    }
  }

  const posted = await post_discord_action_thread_message({
    thread_id,
    action_id: input.action_id,
    content: input.content,
  })

  if (!posted) {
    return null
  }

  if (input.close) {
    const closed = await close_discord_action_thread({
      thread_id,
      action_id: input.action_id,
    })

    if (!closed) {
      return null
    }
  }

  return {
    action_id: input.action_id,
  }
}

export async function sync_discord_action_context(
  input: discord_action_context_input,
): Promise<discord_action_context_result | null> {
  if (input.close && !input.action_id) {
    return null
  }

  if (input.action_id) {
    const updated = await update_discord_action_context({
      action_id: input.action_id,
      content: input.content,
      close: input.close,
    })

    if (updated) {
      return updated
    }

    return null
  }

  return create_discord_action_context({
    title: input.title,
    content: input.content,
  })
}

export function short_room_uuid(room_uuid: string) {
  return room_uuid.replace(/-/g, '').slice(0, 8) || room_uuid.slice(0, 8)
}

function concierge_end_content(event: Extract<
  notify_event,
  { event: 'concierge_closed' }
>) {
  return [
    'Returned to bot',
    `room_uuid: ${event.room_uuid}`,
    `mode: ${event.mode}`,
  ].join('\n')
}

function get_debug_discord_mention_user_ids() {
  const raw = process.env.DISCORD_DEV_USER_IDS

  if (!raw) {
    return []
  }

  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

function build_discord_content(event: notify_event) {
  if (event.event === 'new_user_created') {
    return [
      '[NEW USER]',
      '新しいユーザーが登録されました',
      `provider: ${event.provider}`,
      `user_uuid: ${event.user_uuid}`,
      `visitor_uuid: ${event.visitor_uuid}`,
      `display_name: ${event.display_name ?? 'none'}`,
      `locale: ${event.locale ?? 'unknown'}`,
      `is_new_user: ${event.is_new_user}`,
      `is_new_visitor: ${event.is_new_visitor}`,
    ].join('\n')
  }

  if (event.event === 'concierge_room_request') {
    return [
      '[CONCIERGE REQUEST]',
      `room_uuid: ${event.room_uuid}`,
      `visitor_uuid: ${event.visitor_uuid}`,
      `user_uuid: ${event.user_uuid ?? 'none'}`,
      `channel: ${event.channel}`,
    ].join('\n')
  }

  if (event.event === 'debug_trace') {
    const lines = [
      `**[DEBUG] ${event.category.toUpperCase()}**`,
      `event: \`${event.debug_event}\``,
    ]

    if (Object.keys(event.payload).length > 0) {
      lines.push(
        `\`\`\`json\n${JSON.stringify(event.payload, null, 2)}\n\`\`\``,
      )
    }

    return lines.join('\n')
  }

  if (event.event === 'admin_internal_name_updated') {
    return [
      '[ADMIN INTERNAL NAME UPDATED]',
      `admin_user_uuid: ${event.admin_user_uuid}`,
      `old_internal_name: ${event.old_internal_name ?? 'none'}`,
      `new_internal_name: ${event.new_internal_name}`,
      `updated_by_user_uuid: ${event.updated_by_user_uuid}`,
      `updated_at: ${event.updated_at}`,
      `source_channel: ${event.source_channel}`,
    ].join('\n')
  }

  return null
}

export async function send_discord_notify(
  event: notify_event,
): Promise<discord_notify_result | null> {
  if (event.event === 'concierge_requested') {
    // concierge_requested is orchestrated by notify/index.ts because the
    // thread title and body depend on the live reception summary and the
    // outcome of personal push/LINE delivery. The orchestrator calls
    // `sync_discord_action_context` directly.
    return {
      channel: 'discord',
      action_id: event.action_id,
    }
  }

  if (event.event === 'concierge_closed') {
    const result = event.action_id
      ? await sync_discord_action_context({
          title: `Concierge - ${short_room_uuid(event.room_uuid)}`,
          action_id: event.action_id,
          content: concierge_end_content(event),
          close: true,
        })
      : null

    return {
      channel: 'discord',
      action_id: result ? result.action_id : event.action_id,
    }
  }

  if (event.event === 'debug_trace') {
    const webhook_url = process.env.DISCORD_DEBUG_WEBHOOK_URL
    const content = build_discord_content(event)

    if (!content || !webhook_url) {
      return null
    }

    const mention_users = get_debug_discord_mention_user_ids()
    const mentions = mention_users.map((id) => `<@${id}>`).join(' ')

    await fetch(webhook_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: [mentions, content].filter(Boolean).join('\n'),
        allowed_mentions: {
          users: mention_users,
        },
      }),
    })

    return {
      channel: 'discord',
    }
  }

  const webhook_url = process.env.DISCORD_NOTIFY_WEBHOOK_URL
  const content = build_discord_content(event)

  if (!content) {
    return null
  }

  if (!webhook_url) {
    console.warn('[notify] discord_notify_skipped: missing DISCORD_NOTIFY_WEBHOOK_URL', {
      notify_event: event.event,
    })

    return null
  }

  const response = await fetch(webhook_url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      content,
    }),
  })

  const error_text = await response.text()

  if (!response.ok) {
    return {
      channel: 'discord',
      ok: false,
      http_status: response.status,
      error_text: error_text.length > 0 ? error_text.slice(0, 800) : null,
    }
  }

  return {
    channel: 'discord',
    ok: true,
  }
}
