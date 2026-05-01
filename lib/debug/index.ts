import 'server-only'

type debug_payload = {
  category: string
  event: string
  message?: string
  data?: Record<string, unknown>
}

function get_dev_mentions() {
  const raw = process.env.DISCORD_DEV_USER_IDS

  if (!raw) {
    return ''
  }

  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => `<@${id}>`)
    .join(' ')
}

function get_allowed_users() {
  const raw = process.env.DISCORD_DEV_USER_IDS

  if (!raw) {
    return []
  }

  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

export async function debug(payload: debug_payload) {
  const webhook_url = process.env.DISCORD_DEBUG_WEBHOOK_URL

  if (!webhook_url) {
    return
  }

  const mentions = get_dev_mentions()

  const content = [
    mentions,
    `**[DEBUG] ${payload.category.toUpperCase()}**`,
    `event: \`${payload.event}\``,
    payload.message ? `message: ${payload.message}` : null,
    payload.data
      ? `\`\`\`json\n${JSON.stringify(payload.data, null, 2)}\n\`\`\``
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  await fetch(webhook_url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      content,
      allowed_mentions: {
        users: get_allowed_users(),
      },
    }),
  })
}