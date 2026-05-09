import 'server-only'

type admin_reception_debug_input = {
  event: string
  payload?: Record<string, unknown>
  data?: Record<string, unknown>
}

function get_debug_user_ids() {
  return (
    process.env.DISCORD_DEV_USER_IDS
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean) ?? []
  )
}

export async function debug_admin_reception(
  input: admin_reception_debug_input,
) {
  const webhook_url = process.env.DISCORD_DEBUG_WEBHOOK_URL

  if (!webhook_url) {
    return
  }

  const users = get_debug_user_ids()
  const mentions = users.map((id) => `<@${id}>`).join(' ')
  const content = [
    mentions,
    '**[DEBUG] ADMIN_RECEPTION**',
    `event: \`${input.event}\``,
    '```json',
    JSON.stringify(input.payload ?? input.data ?? {}, null, 2).slice(0, 1500),
    '```',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000)
  const body: Record<string, unknown> = { content }

  if (users.length > 0) {
    body.allowed_mentions = { users }
  }

  await fetch(webhook_url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => {})
}
