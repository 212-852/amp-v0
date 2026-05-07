import 'server-only'

import {
  send_discord_notify,
  sync_discord_action_context,
} from './discord'
import { send_action_trace } from '@/lib/debug/action'
import { send_line_push_notify } from './line'
import {
  resolve_notify_rule,
  type notify_event,
} from './rules'

export type notify_delivery_result = {
  channel: 'discord' | 'line'
  action_id?: string | null
}

export async function notify(event: notify_event) {
  console.log('[ACTION_TRACE] notify_entered', event)
  await send_action_trace('notify_entered', event as unknown as Record<
    string,
    unknown
  >)

  const rule = resolve_notify_rule(event)

  console.log('[ACTION_TRACE] notify_rules_decided', {
    event: event.event,
    decision: rule,
  })
  await send_action_trace('notify_rules_decided', {
    event: event.event,
    decision: rule,
  })

  const deliveries = rule.channels.map((channel) => {
    if (channel === 'discord') {
      return send_discord_notify(event)
    }

    if (channel === 'line' && event.event === 'line_push') {
      return send_line_push_notify({
        line_user_id: event.line_user_id,
        message: event.message,
      })
    }

    return Promise.resolve()
  })

  const settled = await Promise.allSettled(deliveries)

  return settled.flatMap((result) => {
    if (result.status !== 'fulfilled' || !result.value) {
      return []
    }

    return [result.value as notify_delivery_result]
  })
}

export async function sync_room_action_context(input: {
  provider: 'discord'
  title: string
  content: string
  action_id: string | null
}) {
  if (input.provider === 'discord') {
    return sync_discord_action_context({
      title: input.title,
      content: input.content,
      action_id: input.action_id,
    })
  }

  return null
}
