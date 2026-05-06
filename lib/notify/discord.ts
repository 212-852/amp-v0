import 'server-only'

import type { notify_event } from './rules'

const discord_api_base = 'https://discord.com/api/v10'

export type discord_action_context_input = {
  title: string
  content: string
  action_id: string | null
}

export type discord_action_context_result = {
  action_id: string | null
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

  if (!token) {
    return null
  }

  return fetch(`${discord_api_base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bot ${token}`,
      ...(init.headers ?? {}),
    },
  })
}

function action_webhook_url(title: string) {
  const raw = process.env.DISCORD_ACTION_WEBHOOK_URL?.trim()

  if (!raw) {
    return null
  }

  const url = new URL(raw)

  url.searchParams.set('wait', 'true')
  url.searchParams.set('thread_name', title.slice(0, 90))

  return url.toString()
}

async function create_discord_action_context(input: {
  title: string
  content: string
}): Promise<discord_action_context_result | null> {
  const url = action_webhook_url(input.title)

  if (!url) {
    return null
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      content: input.content,
    }),
  })

  if (!response.ok) {
    console.warn(
      '[discord_action] create_failed',
      response.status,
      await response.text(),
    )

    return null
  }

  const payload = (await response.json()) as {
    channel_id?: string
  }

  return {
    action_id: action_id_from_discord_thread_id(
      payload.channel_id ?? null,
    ),
  }
}

async function update_discord_action_context(input: {
  action_id: string
  content: string
}): Promise<discord_action_context_result | null> {
  const thread_id = discord_thread_id_from_action_id(input.action_id)

  if (!thread_id) {
    return null
  }

  const response = await discord_action_bot_fetch(
    `/channels/${thread_id}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: input.content,
      }),
    },
  )

  if (response?.ok) {
    return {
      action_id: input.action_id,
    }
  }

  if (response && !response.ok) {
    console.warn(
      '[discord_action] thread_append_failed',
      response.status,
      await response.text(),
    )
  }

  return null
}

export async function sync_discord_action_context(
  input: discord_action_context_input,
): Promise<discord_action_context_result | null> {
  if (input.action_id) {
    const updated = await update_discord_action_context({
      action_id: input.action_id,
      content: input.content,
    })

    if (updated) {
      return updated
    }
  }

  return create_discord_action_context({
    title: input.title,
    content: input.content,
  })
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

  return null
}

export async function send_discord_notify(event: notify_event) {
  if (event.event === 'debug_trace') {
    const webhook_url = process.env.DISCORD_DEBUG_WEBHOOK_URL
    const content = build_discord_content(event)

    if (!content || !webhook_url) {
      return
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

    return
  }

  const webhook_url = process.env.DISCORD_NOTIFY_WEBHOOK_URL
  const content = build_discord_content(event)

  if (!content) {
    return
  }

  if (!webhook_url) {
    console.warn('[notify] discord_notify_skipped: missing DISCORD_NOTIFY_WEBHOOK_URL', {
      notify_event: event.event,
    })

    return
  }

  await fetch(webhook_url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      content,
    }),
  })
}
