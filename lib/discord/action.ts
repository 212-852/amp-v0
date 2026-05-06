import 'server-only'

const discord_api_base = 'https://discord.com/api/v10'

type discord_action_result = {
  discord_action_post_id: string
  action_id: string | null
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

function action_webhook_message_url(input: {
  post_id: string
  thread_id: string | null
}) {
  const raw = process.env.DISCORD_ACTION_WEBHOOK_URL?.trim()

  if (!raw) {
    return null
  }

  const url = new URL(`${raw}/messages/${input.post_id}`)

  if (input.thread_id) {
    url.searchParams.set('thread_id', input.thread_id)
  }

  return url.toString()
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
  if (!action_id) {
    return null
  }

  if (!action_id.startsWith('discord:')) {
    return null
  }

  const thread_id = action_id.slice('discord:'.length).trim()

  return thread_id || null
}

async function create_action_post(input: {
  title: string
  content: string
}): Promise<discord_action_result | null> {
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
    id?: string
    channel_id?: string
  }

  if (!payload.id) {
    return null
  }

  return {
    discord_action_post_id: payload.id,
    action_id: action_id_from_discord_thread_id(
      payload.channel_id ?? null,
    ),
  }
}

async function update_action_post(input: {
  post_id: string
  action_id: string | null
  content: string
}): Promise<discord_action_result | null> {
  const thread_id = discord_thread_id_from_action_id(input.action_id)
  const response = thread_id
    ? await discord_action_bot_fetch(
        `/channels/${thread_id}/messages/${input.post_id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            content: input.content,
          }),
        },
      )
    : null

  if (response?.ok) {
    return {
      discord_action_post_id: input.post_id,
      action_id: input.action_id,
    }
  }

  if (response && !response.ok) {
    console.warn(
      '[discord_action] bot_update_failed',
      response.status,
      await response.text(),
    )
  }

  const webhook_url = action_webhook_message_url({
    post_id: input.post_id,
    thread_id,
  })

  if (!webhook_url) {
    return null
  }

  const webhook_response = await fetch(webhook_url, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      content: input.content,
    }),
  })

  if (!webhook_response.ok) {
    console.warn(
      '[discord_action] update_failed',
      webhook_response.status,
      await webhook_response.text(),
    )

    return null
  }

  return {
    discord_action_post_id: input.post_id,
    action_id: input.action_id,
  }
}

export async function upsert_discord_action_post(input: {
  title: string
  content: string
  existing_post_id: string | null
  existing_action_id: string | null
}) {
  if (input.existing_post_id) {
    const updated = await update_action_post({
      post_id: input.existing_post_id,
      action_id: input.existing_action_id,
      content: input.content,
    })

    if (updated) {
      return updated
    }
  }

  return create_action_post({
    title: input.title,
    content: input.content,
  })
}
