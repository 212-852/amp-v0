import 'server-only'

import type { archived_message } from '@/lib/chat/archive'
import { debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'
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
  sender_role?: string | null
}

async function load_line_provider_id_for_user(user_uuid: string | null) {
  if (!user_uuid) {
    return null
  }

  const result = await supabase
    .from('identities')
    .select('provider_id')
    .eq('user_uuid', user_uuid)
    .eq('provider', 'line')
    .maybeSingle()

  if (result.error || !result.data) {
    return null
  }

  const provider_id = (result.data as { provider_id?: unknown }).provider_id

  return typeof provider_id === 'string' && provider_id.trim()
    ? provider_id.trim()
    : null
}

function first_message_uuid(messages: archived_message[]) {
  return messages[0]?.archive_uuid ?? null
}

async function emit_reply_delivery_debug(input: {
  event:
    | 'output_reply_channel_resolved'
    | 'admin_reply_delivery_started'
    | 'admin_reply_delivery_succeeded'
    | 'admin_reply_delivery_failed'
  room: chat_room
  message_uuid: string | null
  last_incoming_channel: chat_channel
  selected_output_channel: 'line' | 'web'
  sender_role: string | null
  error_code?: string | null
  error_message?: string | null
}) {
  await debug_event({
    category: 'chat_message',
    event: input.event,
    payload: {
      room_uuid: input.room.room_uuid,
      message_uuid: input.message_uuid,
      last_incoming_channel: input.last_incoming_channel,
      selected_output_channel: input.selected_output_channel,
      sender_role: input.sender_role,
      receiver_user_uuid: input.room.user_uuid,
      receiver_participant_uuid: input.room.participant_uuid,
      error_code: input.error_code ?? null,
      error_message: input.error_message ?? null,
    },
  })
}

export async function output_chat_bundles(
  input: output_chat_input,
) {
  const target = resolve_output_delivery_target(input.channel)
  const message_uuid = first_message_uuid(input.messages)
  const is_admin_reply =
    input.sender_role === 'admin' || input.sender_role === 'concierge'

  if (is_admin_reply) {
    await emit_reply_delivery_debug({
      event: 'output_reply_channel_resolved',
      room: input.room,
      message_uuid,
      last_incoming_channel: input.channel,
      selected_output_channel: target,
      sender_role: input.sender_role ?? null,
    })

    await emit_reply_delivery_debug({
      event: 'admin_reply_delivery_started',
      room: input.room,
      message_uuid,
      last_incoming_channel: input.channel,
      selected_output_channel: target,
      sender_role: input.sender_role ?? null,
    })
  }

  try {
    if (target === 'line') {
      await deliver_line_chat_bundles({
        room: input.room,
        messages: input.messages,
        line_reply_token: input.line_reply_token ?? null,
        line_user_id:
          input.line_user_id ??
          (await load_line_provider_id_for_user(input.room.user_uuid)),
      })
    } else {
      await deliver_web_chat_bundles({
        room: input.room,
        messages: input.messages,
      })
    }

    if (is_admin_reply) {
      await emit_reply_delivery_debug({
        event: 'admin_reply_delivery_succeeded',
        room: input.room,
        message_uuid,
        last_incoming_channel: input.channel,
        selected_output_channel: target,
        sender_role: input.sender_role ?? null,
      })
    }
  } catch (error) {
    if (is_admin_reply) {
      await emit_reply_delivery_debug({
        event: 'admin_reply_delivery_failed',
        room: input.room,
        message_uuid,
        last_incoming_channel: input.channel,
        selected_output_channel: target,
        sender_role: input.sender_role ?? null,
        error_code: error instanceof Error ? error.name : 'output_error',
        error_message: error instanceof Error ? error.message : String(error),
      })
    }

    throw error
  }

  return {
    delivered: true,
  }
}
