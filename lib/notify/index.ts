import 'server-only'

import { send_discord_notify } from './discord'
import { send_line_push_notify } from './line'
import {
  resolve_notify_rule,
  type notify_event,
} from './rules'

export async function notify(event: notify_event) {
  const rule = resolve_notify_rule(event)

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

  await Promise.allSettled(deliveries)
}
