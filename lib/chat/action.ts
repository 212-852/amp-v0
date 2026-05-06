import 'server-only'

import {
  archive_incoming_line_text,
  archive_message_bundles,
  has_initial_messages,
  load_archived_messages,
  type archived_message,
} from './archive'
import { resolve_chat_context } from '@/lib/dispatch/context'
import {
  build_initial_chat_bundles,
  build_line_followup_ack_bundle,
  build_user_text_bundle,
} from './message'
import type { chat_locale } from './message'
import {
  resolve_chat_room,
  type chat_channel,
  type chat_room,
} from './room'
import { should_seed_initial_messages } from './rules'
import { output_chat_bundles } from '@/lib/output'

type resolve_initial_chat_input = {
  visitor_uuid: string
  user_uuid?: string | null
  channel: chat_channel
  locale: chat_locale
  external_room_id?: string | null
  line_reply_token?: string | null
  line_user_id?: string | null
  incoming_line_text?: {
    text: string
    line_message_id: string
    created_at: string
    webhook_event_id?: string | null
    delivery_context_redelivery?: boolean | null
  } | null
}

export type initial_chat_result = {
  room: chat_room
  is_new_room: boolean
  is_seeded: boolean
  messages: archived_message[]
}

async function archive_input_line_text_for_room(input: {
  room: chat_room
  locale: chat_locale
  line_user_id?: string | null
  incoming_line_text?: resolve_initial_chat_input['incoming_line_text']
}) {
  if (!input.line_user_id || !input.incoming_line_text) {
    return null
  }

  return archive_incoming_line_text({
    room_uuid: input.room.room_uuid,
    participant_uuid: input.room.participant_uuid,
    user_uuid: input.room.user_uuid,
    visitor_uuid: input.room.visitor_uuid,
    line_user_id: input.line_user_id,
    line_message_id: input.incoming_line_text.line_message_id,
    text: input.incoming_line_text.text,
    created_at: input.incoming_line_text.created_at,
    webhook_event_id:
      input.incoming_line_text.webhook_event_id ?? null,
    delivery_context_redelivery:
      input.incoming_line_text.delivery_context_redelivery ?? null,
    bundle: build_user_text_bundle({
      text: input.incoming_line_text.text,
      locale: input.locale,
      content_key: 'line.incoming.text',
    }),
  })
}

export async function resolve_initial_chat(
  input: resolve_initial_chat_input,
): Promise<initial_chat_result> {
  const room_result = await resolve_chat_room({
    visitor_uuid: input.visitor_uuid,
    user_uuid: input.user_uuid ?? null,
    channel: input.channel,
    external_room_id: input.external_room_id ?? null,
  })

  if (!room_result.ok || !room_result.room.room_uuid) {
    return {
      room: room_result.room,
      is_new_room: false,
      is_seeded: false,
      messages: [],
    }
  }

  let archived_messages: archived_message[]

  try {
    archived_messages = await load_archived_messages(
      room_result.room.room_uuid,
    )
  } catch (error) {
    const e = error as { code?: string; message?: string }
    console.error('[chat_room]', 'room_failed', 'load_archived_messages', {
      error,
      error_code: e.code,
      error_message: e.message,
      room_uuid: room_result.room.room_uuid,
    })

    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: false,
      messages: [],
    }
  }

  const room_has_initial_messages = await has_initial_messages(
    room_result.room.room_uuid,
  )
  const should_seed =
    !room_has_initial_messages &&
    should_seed_initial_messages(archived_messages)

  if (!should_seed) {
    if (
      input.channel === 'line' &&
      input.line_reply_token &&
      input.line_user_id &&
      input.incoming_line_text
    ) {
      const archived_incoming = await archive_input_line_text_for_room({
        room: room_result.room,
        locale: input.locale,
        line_user_id: input.line_user_id,
        incoming_line_text: input.incoming_line_text,
      })

      if (archived_incoming?.is_duplicate) {
        return {
          room: room_result.room,
          is_new_room: room_result.is_new_room,
          is_seeded: false,
          messages: await load_archived_messages(
            room_result.room.room_uuid,
          ),
        }
      }

      const ack_bundles = [
        build_line_followup_ack_bundle({ locale: input.locale }),
      ]
      const outgoing = await archive_message_bundles({
        room_uuid: room_result.room.room_uuid,
        participant_uuid: room_result.room.participant_uuid,
        bot_participant_uuid: room_result.room.bot_participant_uuid,
        channel: 'line',
        bundles: ack_bundles,
      })

      await output_chat_bundles({
        room: room_result.room,
        channel: 'line',
        messages: outgoing,
        line_reply_token: input.line_reply_token,
        line_user_id: input.line_user_id ?? null,
      })

      return {
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: await load_archived_messages(
          room_result.room.room_uuid,
        ),
      }
    }

    if (
      input.channel === 'line' &&
      input.line_user_id &&
      input.incoming_line_text
    ) {
      await archive_input_line_text_for_room({
        room: room_result.room,
        locale: input.locale,
        line_user_id: input.line_user_id,
        incoming_line_text: input.incoming_line_text,
      })
    }

    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: false,
      messages: await load_archived_messages(
        room_result.room.room_uuid,
      ),
    }
  }

  try {
    if (input.channel === 'line' && !input.line_reply_token?.trim()) {
      return {
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: archived_messages,
      }
    }

    const archived_incoming =
      input.channel === 'line'
        ? await archive_input_line_text_for_room({
            room: room_result.room,
            locale: input.locale,
            line_user_id: input.line_user_id,
            incoming_line_text: input.incoming_line_text,
          })
        : null

    if (archived_incoming?.is_duplicate) {
      return {
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: await load_archived_messages(
          room_result.room.room_uuid,
        ),
      }
    }

    const bundles = build_initial_chat_bundles({
      locale: input.locale,
    })
    const seeded_messages = await archive_message_bundles({
      room_uuid: room_result.room.room_uuid,
      participant_uuid: room_result.room.participant_uuid,
      bot_participant_uuid: room_result.room.bot_participant_uuid,
      channel: input.channel,
      bundles,
    })

    await output_chat_bundles({
      room: room_result.room,
      channel: input.channel,
      messages: seeded_messages,
      line_reply_token: input.line_reply_token ?? null,
      line_user_id: input.line_user_id ?? null,
    })

    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: true,
      messages: [
        ...(archived_incoming?.archived_message
          ? [archived_incoming.archived_message]
          : []),
        ...seeded_messages,
      ],
    }
  } catch (error) {
    const e = error as { code?: string; message?: string }
    console.error('[chat_room]', 'room_failed', 'seed_initial_messages', {
      error,
      error_code: e.code,
      error_message: e.message,
      room_uuid: room_result.room.room_uuid,
    })

    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: false,
      messages: archived_messages,
    }
  }
}

export async function load_user_home_chat() {
  const chat_context = await resolve_chat_context({
    channel: 'web',
  })
  const visitor_uuid = chat_context.visitor_uuid

  if (!visitor_uuid) {
    return {
      room: {
        room_uuid: '',
        participant_uuid: '',
        bot_participant_uuid: '',
        user_uuid: null,
        visitor_uuid: '',
        channel: 'web' as const,
      },
      is_new_room: false,
      is_seeded: false,
      messages: [],
    }
  }

  return resolve_initial_chat({
    ...chat_context,
    visitor_uuid,
  })
}
