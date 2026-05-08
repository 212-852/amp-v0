import 'server-only'

export async function send_action_trace(
  event: string,
  payload: Record<string, unknown>,
) {
  if (process.env.ACTION_TRACE_ENABLED !== 'true') {
    return
  }

  const url =
    process.env.DISCORD_DEBUG_WEBHOOK_URL ||
    process.env.DISCORD_ACTION_WEBHOOK_URL

  if (!url) {
    return
  }

  const json_block = JSON.stringify(payload, null, 2).slice(0, 1500)
  let content =
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

  await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => {})
}
