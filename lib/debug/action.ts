import 'server-only'

function resolve_action_trace_dev_user_ids(): string[] {
  return (process.env.DISCORD_DEV_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

export async function send_action_trace(
  event: string,
  payload: Record<string, unknown>,
) {
  const url =
    process.env.DISCORD_DEBUG_WEBHOOK_URL ||
    process.env.DISCORD_ACTION_WEBHOOK_URL

  if (!url) {
    return
  }

  const dev_user_ids = resolve_action_trace_dev_user_ids()
  const mention_text = dev_user_ids
    .map((id) => `<@${id}>`)
    .join(' ')

  const json_block = JSON.stringify(payload, null, 2).slice(0, 1500)
  let content =
    `${mention_text ? mention_text + '\n' : ''}` +
    '[ACTION_TRACE] ' +
    event +
    '\n```json\n' +
    json_block +
    '\n```'

  if (content.length > 2000) {
    content = content.slice(0, 1997) + '...'
  }

  const body: Record<string, unknown> = {
    content,
  }

  if (dev_user_ids.length > 0) {
    body.allowed_mentions = {
      users: dev_user_ids,
    }
  }

  await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => {})
}
