import 'server-only'

import {
  archive_incoming_line_text,
  archive_message_bundles,
  type archived_message,
} from '@/lib/chat/archive'
import {
  build_driver_recruitment_bundle,
  build_user_text_bundle,
  type chat_locale,
} from '@/lib/chat/message'
import type { chat_channel, chat_room } from '@/lib/chat/room'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'
import { output_chat_bundles } from '@/lib/output'

import {
  detect_driver_recruitment_intent,
  type recruitment_intent,
} from './rules'

type incoming_line_text = {
  line_message_id: string
  text: string
  created_at?: string
  webhook_event_id?: string | null
  delivery_context_redelivery?: boolean | null
}

export type driver_recruitment_reply_input = {
  text: string
  locale: chat_locale
  room: chat_room
  channel: chat_channel
  concierge_staff_active: boolean
  line_reply_token?: string | null
  line_user_id?: string | null
  incoming_line_text?: incoming_line_text | null
}

export type driver_recruitment_reply_result = {
  handled: true
  intent: recruitment_intent
  messages: archived_message[]
  is_duplicate: boolean
}

export async function try_deliver_driver_recruitment_reply(
  input: driver_recruitment_reply_input,
): Promise<driver_recruitment_reply_result | null> {
  const intent = detect_driver_recruitment_intent(input.text, {
    source_channel: input.channel,
  })
  const normalized_text = input.text.trim().replace(/\s+/g, ' ')

  if (!intent) {
    return null
  }

  const incoming_bundle = build_user_text_bundle({
    text: normalized_text,
    locale: input.locale,
    content_key: 'recruitment.incoming.text',
    metadata: {
      intent,
    },
  })

  let archived_incoming: archived_message | null = null
  let is_duplicate = false

  if (
    input.channel === 'line' &&
    input.line_user_id &&
    input.incoming_line_text
  ) {
    const line_archived = await archive_incoming_line_text({
      room_uuid: clean_uuid(input.room.room_uuid) ?? input.room.room_uuid,
      participant_uuid:
        clean_uuid(input.room.participant_uuid) ?? input.room.participant_uuid,
      user_uuid: clean_uuid(input.room.user_uuid),
      visitor_uuid: clean_uuid(input.room.visitor_uuid),
      line_user_id: input.line_user_id,
      line_message_id: input.incoming_line_text.line_message_id,
      text: input.incoming_line_text.text,
      created_at:
        input.incoming_line_text.created_at ?? new Date().toISOString(),
      webhook_event_id: input.incoming_line_text.webhook_event_id ?? null,
      delivery_context_redelivery:
        input.incoming_line_text.delivery_context_redelivery ?? null,
      bundle: incoming_bundle,
    })

    is_duplicate = line_archived.is_duplicate
    archived_incoming = line_archived.archived_message
  } else {
    const web_archived = await archive_message_bundles({
      room_uuid: input.room.room_uuid,
      participant_uuid: input.room.participant_uuid,
      bot_participant_uuid: input.room.bot_participant_uuid,
      channel: input.channel,
      bundles: [incoming_bundle],
    })

    archived_incoming = web_archived[0] ?? null
  }

  if (is_duplicate) {
    const messages = archived_incoming ? [archived_incoming] : []

    return {
      handled: true,
      intent,
      messages,
      is_duplicate: true,
    }
  }

  const recruitment_bundle = build_driver_recruitment_bundle({
    locale: input.locale,
  })

  await debug_event({
    category: 'recruitment',
    event: 'recruitment_bundle_built',
    payload: {
      bundle_type: recruitment_bundle.bundle_type,
      card_count: recruitment_bundle.payload.cards.length,
      image_path: recruitment_bundle.payload.image.src,
      cta_path: recruitment_bundle.payload.ctas[0]?.href ?? null,
      source_channel: input.channel,
    },
  })

  const outgoing_messages = await archive_message_bundles({
    room_uuid: input.room.room_uuid,
    participant_uuid: input.room.participant_uuid,
    bot_participant_uuid: input.room.bot_participant_uuid,
    channel: input.channel,
    bundles: [recruitment_bundle],
  })

  if (input.channel === 'line') {
    await output_chat_bundles({
      room: input.room,
      channel: input.channel,
      messages: outgoing_messages,
      line_reply_token: input.line_reply_token ?? null,
      line_user_id: input.line_user_id ?? null,
    })
  }

  const messages = [
    ...(archived_incoming ? [archived_incoming] : []),
    ...outgoing_messages,
  ]

  return {
    handled: true,
    intent,
    messages,
    is_duplicate: false,
  }
}
