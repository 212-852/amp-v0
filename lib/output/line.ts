import 'server-only'

import type { archived_message } from '@/lib/chat/archive'
import type { chat_room } from '@/lib/chat/room'

type deliver_line_chat_bundles_input = {
  room: chat_room
  messages: archived_message[]
}

export async function deliver_line_chat_bundles(
  input: deliver_line_chat_bundles_input,
) {
  void input
}
