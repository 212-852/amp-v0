import 'server-only'

import { resolve_initial_chat } from '@/lib/chat/action'
import {
  ensure_direct_room_for_visitor,
  resolve_chat_room,
  type chat_channel,
} from '@/lib/chat/room'
import { debug_event } from '@/lib/debug'
import type { locale_key } from '@/lib/locale/action'
import type { normalized_role, normalized_tier } from '@/lib/auth/identity'

export type browser_session_chat_snapshot = {
  room_uuid: string
  participant_uuid: string
  mode: 'bot' | 'concierge'
  is_seeded: boolean
  message_count: number
  initial_carousel_card_count: number
}

type resolve_browser_session_chat_room_input = {
  visitor_uuid: string
  user_uuid: string | null
  channel: chat_channel
  locale: locale_key
  is_new_visitor: boolean
  session_restored: boolean
  role: normalized_role
  tier: normalized_tier
  source_channel: string
}

function base_debug_payload(input: resolve_browser_session_chat_room_input) {
  return {
    visitor_uuid: input.visitor_uuid,
    user_uuid: input.user_uuid,
    participant_uuid: null as string | null,
    room_uuid: null as string | null,
    source_channel: input.source_channel,
    role: input.role,
    tier: input.tier,
    reason: null as string | null,
  }
}

/**
 * Browser session: ensure direct room exists, resolve participant/room, then
 * load/seed messages via resolve_initial_chat (single chat core path).
 */
export async function run_browser_session_chat_room_resolve(
  input: resolve_browser_session_chat_room_input,
): Promise<browser_session_chat_snapshot | null> {
  const base = base_debug_payload(input)

  await debug_event({
    category: 'chat_room',
    event: 'chat_room_resolve_started',
    payload: {
      ...base,
      reason: 'browser_session',
    },
  })

  try {
    await ensure_direct_room_for_visitor({
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
      channel: input.channel,
    })

    const room_probe = await resolve_chat_room({
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
      channel: input.channel,
    })

    if (!room_probe.ok || !room_probe.room.room_uuid) {
      await debug_event({
        category: 'chat_room',
        event: 'chat_room_resolve_failed',
        payload: {
          ...base,
          room_ok: room_probe.ok,
          participant_uuid: room_probe.room.participant_uuid || null,
          room_uuid: room_probe.room.room_uuid || null,
          reason: 'resolve_chat_room_failed',
        },
      })

      return null
    }

    const initial_chat = await resolve_initial_chat({
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
      channel: input.channel,
      locale: input.locale,
      session_restored: input.session_restored,
    })

    if (!initial_chat.room.room_uuid) {
      await debug_event({
        category: 'chat_room',
        event: 'chat_room_resolve_failed',
        payload: {
          ...base,
          participant_uuid: initial_chat.room.participant_uuid || null,
          room_uuid: null,
          reason: 'initial_chat_room_missing',
        },
      })

      const snapshot: browser_session_chat_snapshot = {
        room_uuid: room_probe.room.room_uuid,
        participant_uuid: room_probe.room.participant_uuid,
        mode: room_probe.room.mode,
        is_seeded: false,
        message_count: 0,
        initial_carousel_card_count: 0,
      }

      await debug_event({
        category: 'chat_room',
        event: 'chat_room_resolve_succeeded',
        payload: {
          visitor_uuid: input.visitor_uuid,
          user_uuid: input.user_uuid,
          participant_uuid: room_probe.room.participant_uuid,
          room_uuid: room_probe.room.room_uuid,
          source_channel: input.source_channel,
          role: input.role,
          tier: input.tier,
          reason: 'resolve_chat_room_ok_initial_chat_missing',
        },
      })

      return snapshot
    }

    const initial_carousel_card_count = initial_chat.messages.reduce(
      (count, message) => {
        if (message.bundle.bundle_type !== 'initial_carousel') {
          return count
        }

        return count + message.bundle.cards.length
      },
      0,
    )

    const snapshot: browser_session_chat_snapshot = {
      room_uuid: initial_chat.room.room_uuid,
      participant_uuid: initial_chat.room.participant_uuid,
      mode: initial_chat.room.mode,
      is_seeded: initial_chat.is_seeded,
      message_count: initial_chat.messages.length,
      initial_carousel_card_count,
    }

    await debug_event({
      category: 'chat_room',
      event: 'chat_room_resolve_succeeded',
      payload: {
        visitor_uuid: input.visitor_uuid,
        user_uuid: input.user_uuid,
        participant_uuid: initial_chat.room.participant_uuid,
        room_uuid: initial_chat.room.room_uuid,
        source_channel: input.source_channel,
        role: input.role,
        tier: input.tier,
        reason: 'resolve_initial_chat_ok',
      },
    })

    if (input.session_restored && input.user_uuid) {
      await debug_event({
        category: 'chat_room',
        event: 'participant_linked_to_user',
        payload: {
          visitor_uuid: input.visitor_uuid,
          user_uuid: input.user_uuid,
          participant_uuid: initial_chat.room.participant_uuid,
          room_uuid: initial_chat.room.room_uuid,
          source_channel: input.source_channel,
          role: input.role,
          tier: input.tier,
          reason: 'session_restored',
        },
      })
    }

    if (
      input.session_restored &&
      input.user_uuid &&
      !initial_chat.is_new_room
    ) {
      await debug_event({
        category: 'chat_room',
        event: 'room_uuid_restored',
        payload: {
          visitor_uuid: input.visitor_uuid,
          user_uuid: input.user_uuid,
          participant_uuid: initial_chat.room.participant_uuid,
          room_uuid: initial_chat.room.room_uuid,
          source_channel: input.source_channel,
          role: input.role,
          tier: input.tier,
          reason: 'existing_room',
        },
      })
    }

    return snapshot
  } catch (error) {
    await debug_event({
      category: 'chat_room',
      event: 'chat_room_resolve_failed',
      payload: {
        ...base,
        reason: 'exception',
        error_message: error instanceof Error ? error.message : String(error),
      },
    })

    return null
  }
}
