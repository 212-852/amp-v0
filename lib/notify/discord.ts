import 'server-only'

import type { notify_event } from './rules'

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
