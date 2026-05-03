import 'server-only'

import { debug } from '@/lib/debug'

import type { notify_event } from './rules'

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

  return null
}

export async function send_discord_notify(event: notify_event) {
  const webhook_url = process.env.DISCORD_NOTIFY_WEBHOOK_URL
  const content = build_discord_content(event)

  if (!content) {
    return
  }

  if (!webhook_url) {
    await debug({
      category: 'notify',
      event: 'discord_notify_skipped',
      data: {
        reason: 'missing_webhook_url',
        notify_event: event.event,
      },
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
