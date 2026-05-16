import 'server-only'

import type { archived_message } from '@/lib/chat/archive'
import { derive_presence_recent_from_timestamps } from '@/lib/chat/presence/rules'
import { debug_event } from '@/lib/debug'
import { supabase } from '@/lib/db/supabase'
import { resolve_chat_external_notification_decision } from '@/lib/notification/rules'
import type {
  chat_channel,
  chat_room,
} from '@/lib/chat/room'

import { deliver_line_chat_bundles } from './line'
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
    | 'output_reply_delivery_started'
    | 'output_reply_delivery_succeeded'
    | 'output_reply_delivery_failed'
  room: chat_room
  message_uuid: string | null
  last_incoming_channel: chat_channel
  selected_output_channel: 'line' | 'web'
  user_active_channel: chat_channel | null
  primary_channel: 'push' | 'line' | 'none' | null
  reason: string
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
      user_active_channel: input.user_active_channel,
      primary_channel: input.primary_channel,
      reason: input.reason,
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
  const message_uuid = first_message_uuid(input.messages)
  const is_admin_reply =
    input.sender_role === 'admin' || input.sender_role === 'concierge'
  const notification_decision = is_admin_reply
    ? await resolve_chat_external_notification_decision({
        user_uuid: input.room.user_uuid,
        participant_uuid: input.room.participant_uuid,
        source_channel: input.channel,
      })
    : null
  const participant_presence = is_admin_reply
    ? await supabase
        .from('participants')
        .select('last_channel, last_seen_at, is_typing, typing_at')
        .eq('participant_uuid', input.room.participant_uuid)
        .maybeSingle()
    : null
  const active_row =
    (participant_presence?.data as
      | {
          last_channel?: string | null
          last_seen_at?: string | null
          is_typing?: boolean | null
          typing_at?: string | null
        }
      | null) ?? null
  const presence_recent =
    active_row &&
    derive_presence_recent_from_timestamps({
      last_seen_at:
        typeof active_row.last_seen_at === 'string'
          ? active_row.last_seen_at
          : null,
      is_typing: active_row.is_typing === true,
      typing_at:
        typeof active_row.typing_at === 'string'
          ? active_row.typing_at
          : null,
    })
  const user_active_channel =
    presence_recent &&
    (active_row.last_channel === 'web' ||
      active_row.last_channel === 'pwa' ||
      active_row.last_channel === 'liff')
      ? (active_row.last_channel as chat_channel)
      : null
  const target =
    user_active_channel !== null
      ? 'web'
      : input.channel === 'line'
        ? 'line'
        : 'web'
  const reason =
    user_active_channel !== null
      ? 'active_in_app_chat'
      : input.channel === 'line'
        ? 'last_incoming_line'
        : 'last_incoming_web_like'
  const primary_channel = notification_decision
    ? notification_decision.primary_channel
    : null

  if (is_admin_reply) {
    await emit_reply_delivery_debug({
      event: 'output_reply_channel_resolved',
      room: input.room,
      message_uuid,
      last_incoming_channel: input.channel,
      selected_output_channel: target,
      user_active_channel,
      primary_channel,
      reason,
      sender_role: input.sender_role ?? null,
    })

    await emit_reply_delivery_debug({
      event: 'output_reply_delivery_started',
      room: input.room,
      message_uuid,
      last_incoming_channel: input.channel,
      selected_output_channel: target,
      user_active_channel,
      primary_channel,
      reason,
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
        event: 'output_reply_delivery_succeeded',
        room: input.room,
        message_uuid,
        last_incoming_channel: input.channel,
        selected_output_channel: target,
        user_active_channel,
        primary_channel,
        reason,
        sender_role: input.sender_role ?? null,
      })
    }
  } catch (error) {
    if (is_admin_reply) {
      await emit_reply_delivery_debug({
        event: 'output_reply_delivery_failed',
        room: input.room,
        message_uuid,
        last_incoming_channel: input.channel,
        selected_output_channel: target,
        user_active_channel,
        primary_channel,
        reason,
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
