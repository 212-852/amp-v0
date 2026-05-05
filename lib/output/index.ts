import 'server-only'

import type { archived_message } from '@/lib/chat/archive'
import type {
  chat_channel,
  chat_room,
} from '@/lib/chat/room'

import { deliver_line_chat_bundles } from './line'
import { resolve_output_delivery_target } from './rules'
import { deliver_web_chat_bundles } from './web'

type output_chat_input = {
  room: chat_room
  channel: chat_channel
  messages: archived_message[]
  line_reply_token?: string | null
  line_user_id?: string | null
}

export async function output_chat_bundles(
  input: output_chat_input,
) {
  const target = resolve_output_delivery_target(input.channel)

  if (target === 'line') {
    await deliver_line_chat_bundles({
      room: input.room,
      messages: input.messages,
      line_reply_token: input.line_reply_token ?? null,
      line_user_id: input.line_user_id ?? null,
    })
  } else {
    await deliver_web_chat_bundles({
      room: input.room,
      messages: input.messages,
    })
  }

  return {
    delivered: true,
  }
}
