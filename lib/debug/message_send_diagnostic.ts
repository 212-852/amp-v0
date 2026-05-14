import 'server-only'

import { debug_control } from '@/lib/debug/control'
import { debug_event } from './index'

export async function emit_message_send_diagnostic_pair(input: {
  chat_event: string
  user_event: string
  payload: Record<string, unknown>
}) {
  if (!debug_control.message_send_trace_enabled) {
    return
  }

  const payload = { ...input.payload }

  await debug_event({
    category: 'chat_message',
    event: input.chat_event,
    payload,
  })

  await debug_event({
    category: 'user_message',
    event: input.user_event,
    payload,
  })
}

export async function emit_message_send_chat_only(input: {
  event: string
  payload: Record<string, unknown>
}) {
  if (!debug_control.message_send_trace_enabled) {
    return
  }

  await debug_event({
    category: 'chat_message',
    event: input.event,
    payload: { ...input.payload },
  })
}
