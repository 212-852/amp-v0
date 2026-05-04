import 'server-only'

import type { chat_channel } from '@/lib/chat/room'

export type output_delivery_target = 'web' | 'line'

export function resolve_output_delivery_target(
  channel: chat_channel,
): output_delivery_target {
  if (channel === 'line') {
    return 'line'
  }

  return 'web'
}
