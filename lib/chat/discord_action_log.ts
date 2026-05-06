import 'server-only'

const discord_api_base = 'https://discord.com/api/v10'

async function discord_bot_fetch(
  path: string,
  init: RequestInit,
): Promise<Response | null> {
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

export type discord_action_log_patch = {
  discord_action_post_id: string
  discord_action_thread_id: string | null
}

/**
 * Admin tracking only. DB is the source of truth; Discord never drives state.
 */
export async function upsert_room_discord_action_log(input: {
  channel_id: string | null
  existing_post_id: string | null
  existing_thread_id: string | null
  content: string
}): Promise<discord_action_log_patch | null> {
  const channel_id =
    input.channel_id?.trim() ??
    process.env.DISCORD_ACTION_CHANNEL_ID?.trim() ??
    null

  if (!channel_id) {
    return null
  }

  if (input.existing_post_id) {
    const res = await discord_bot_fetch(
      `/channels/${channel_id}/messages/${input.existing_post_id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ content: input.content }),
      },
    )

    if (!res) {
      return null
    }

    if (!res.ok) {
      console.warn(
        '[discord_action_log] patch_failed',
        res.status,
        await res.text(),
      )

      return null
    }

    return {
      discord_action_post_id: input.existing_post_id,
      discord_action_thread_id: input.existing_thread_id,
    }
  }

  const res = await discord_bot_fetch(`/channels/${channel_id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: input.content }),
  })

  if (!res) {
    return null
  }

  if (!res.ok) {
    console.warn(
      '[discord_action_log] post_failed',
      res.status,
      await res.text(),
    )

    return null
  }

  const payload = (await res.json()) as { id?: string }

  if (!payload.id) {
    return null
  }

  return {
    discord_action_post_id: payload.id,
    discord_action_thread_id: input.existing_thread_id,
  }
}
