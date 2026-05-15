import 'server-only'

import type { chat_channel } from '@/lib/chat/room'

export type output_delivery_target = 'web' | 'line'

export const line_reply_message_cap = 5

export function cap_line_messages_for_reply<T>(messages: T[]): T[] {
  return messages.slice(0, line_reply_message_cap)
}

export function resolve_output_delivery_target(
  channel: chat_channel,
): output_delivery_target {
  if (channel === 'line' || channel === 'liff') {
    return 'line'
  }

  return 'web'
}
