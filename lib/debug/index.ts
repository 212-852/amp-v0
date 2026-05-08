import 'server-only'

import { control } from '@/lib/config/control'
import { notify } from '@/lib/notify'

type debug_payload = {
  category: string
  event: string
  message?: string
  data?: Record<string, unknown>
}

function allow_discord_debug_category(category: string) {
  if (category === 'chat_room' && !control.debug.chat_room) {
    return false
  }

  if (category === 'line_webhook' && !control.debug.line_webhook) {
    return false
  }

  if (category === 'line' && !control.debug.line) {
    return false
  }

  if (category === 'locale' && !control.debug.locale) {
    return false
  }

  if (category === 'identity' && !control.debug.identity) {
    return false
  }

  if (category === 'auth_route' && !control.debug.auth_route) {
    return false
  }

  if (category === 'USER_PAGE' && !control.debug.user_page) {
    return false
  }

  if (!control.debug.use_discord_category_allowlist) {
    return true
  }

  const list = control.debug.discord_category_allowlist

  if (list.length > 0) {
    return (list as readonly string[]).includes(category)
  }

  return true
}

function get_dev_mentions() {
  return get_allowed_users()
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

export async function debug_event(input: {
  category: string
  event: string
  payload?: Record<string, unknown>
}) {
  if (!allow_discord_debug_category(input.category)) {
    return
  }

  try {
    await notify({
      event: 'debug_trace',
      category: input.category,
      debug_event: input.event,
      payload: input.payload ?? {},
    })
  } catch {
    // never block callers
  }
}

export async function debug(payload: debug_payload) {
  if (!allow_discord_debug_category(payload.category)) {
    return
  }

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

export async function forced_debug_event(input: {
  category: string
  event: string
  payload?: Record<string, unknown>
}) {
  const webhook_url = process.env.DISCORD_DEBUG_WEBHOOK_URL

  if (!webhook_url) {
    return
  }

  const users = get_allowed_users()
  const mentions = users.map((id) => `<@${id}>`).join(' ')
  const content = [
    mentions,
    `**[DEBUG] ${input.category.toUpperCase()}**`,
    `event: \`${input.event}\``,
    `\`\`\`json\n${JSON.stringify(input.payload ?? {}, null, 2).slice(0, 1500)}\n\`\`\``,
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
