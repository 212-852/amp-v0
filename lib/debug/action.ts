import 'server-only'

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

  await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      content:
        '[ACTION_TRACE] ' +
        event +
        '\n```json\n' +
        JSON.stringify(payload, null, 2).slice(0, 1500) +
        '\n```',
    }),
  }).catch(() => {})
}
