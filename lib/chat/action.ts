import 'server-only'

import {
  archive_message_bundles,
  load_archived_messages,
  type archived_message,
} from './archive'
import { debug_event } from '@/lib/debug'
import { resolve_chat_context } from '@/lib/dispatch/context'
import { build_initial_chat_bundles } from './message'
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
}

export type initial_chat_result = {
  room: chat_room
  is_new_room: boolean
  is_seeded: boolean
  messages: archived_message[]
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
    console.error('[chat_room]', 'room_failed', error)

    await debug_event({
      category: 'chat_room',
      event: 'room_failed',
      payload: {
        phase: 'load_archived_messages',
        error,
        error_code: e.code,
        error_message: e.message,
        room_uuid: room_result.room.room_uuid,
      },
    })

    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: false,
      messages: [],
    }
  }

  if (!should_seed_initial_messages(archived_messages)) {
    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: false,
      messages: archived_messages,
    }
  }

  try {
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
    })

    return {
      room: room_result.room,
      is_new_room: room_result.is_new_room,
      is_seeded: true,
      messages: seeded_messages,
    }
  } catch (error) {
    const e = error as { code?: string; message?: string }
    console.error('[chat_room]', 'room_failed', error)

    await debug_event({
      category: 'chat_room',
      event: 'room_failed',
      payload: {
        phase: 'seed_initial_messages',
        error,
        error_code: e.code,
        error_message: e.message,
        room_uuid: room_result.room.room_uuid,
      },
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
