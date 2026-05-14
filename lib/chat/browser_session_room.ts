import 'server-only'

import {
  resolve_initial_chat,
  type initial_chat_result,
} from '@/lib/chat/action'
import {
  resolve_user_room,
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

function normalized_error_fields(error: unknown) {
  let error_json: string | null = null

  try {
    error_json = JSON.stringify(error)
  } catch {
    error_json = null
  }

  if (error instanceof Error) {
    return {
      error_code: null,
      error_message: error.message,
      error_details: null,
      error_hint: null,
      error_json,
    }
  }

  if (error && typeof error === 'object') {
    const record = error as {
      code?: unknown
      message?: unknown
      details?: unknown
      hint?: unknown
    }

    return {
      error_code: typeof record.code === 'string' ? record.code : null,
      error_message:
        typeof record.message === 'string' && record.message.trim()
          ? record.message
          : error_json && error_json !== '{}'
            ? error_json
            : String(error),
      error_details:
        typeof record.details === 'string' ? record.details : null,
      error_hint: typeof record.hint === 'string' ? record.hint : null,
      error_json,
    }
  }

  return {
    error_code: null,
    error_message: error ? String(error) : 'unknown_error',
    error_details: null,
    error_hint: null,
    error_json,
  }
}

/**
 * Browser session: resolve_user_room (lib/chat/room.ts) then
 * resolve_initial_chat (messages). No polling or timed retries.
 */
export async function run_browser_session_chat_room_resolve(
  input: resolve_browser_session_chat_room_input,
): Promise<browser_session_chat_snapshot | null> {
  const base = base_debug_payload(input)

  try {
    const room_core = await resolve_user_room({
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
      channel: input.channel,
      source_channel: input.source_channel,
      role: input.role,
      tier: input.tier,
    })

    if (!room_core.ok) {
      return null
    }

    const resolved_channel = room_core.channel

    const snapshot_from_room_core = (): browser_session_chat_snapshot => ({
      room_uuid: room_core.room_uuid,
      participant_uuid: room_core.participant_uuid,
      mode: room_core.mode,
      is_seeded: false,
      message_count: 0,
      initial_carousel_card_count: 0,
    })

    let initial_chat: initial_chat_result

    try {
      initial_chat = await resolve_initial_chat({
        visitor_uuid: input.visitor_uuid,
        user_uuid: input.user_uuid,
        channel: resolved_channel,
        locale: input.locale,
        session_restored: input.session_restored,
      })
    } catch (inner) {
      await debug_event({
        category: 'chat_room',
        event: 'chat_room_resolve_failed',
        payload: {
          ...base,
          participant_uuid: room_core.participant_uuid,
          room_uuid: room_core.room_uuid,
          source_channel: resolved_channel,
          reason: 'resolve_initial_chat_exception',
          ...normalized_error_fields(inner),
        },
      })

      return snapshot_from_room_core()
    }

    if (!initial_chat.room.room_uuid) {
      await debug_event({
        category: 'chat_room',
        event: 'chat_room_resolve_failed',
        payload: {
          ...base,
          participant_uuid: initial_chat.room.participant_uuid || null,
          room_uuid: null,
          source_channel: resolved_channel,
          reason: 'initial_chat_room_missing',
          error_code: 'initial_chat_room_missing',
        },
      })

      return snapshot_from_room_core()
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

    if (input.session_restored && input.user_uuid) {
      await debug_event({
        category: 'chat_room',
        event: 'participant_linked_to_user',
        payload: {
          visitor_uuid: input.visitor_uuid,
          user_uuid: input.user_uuid,
          participant_uuid: initial_chat.room.participant_uuid,
          room_uuid: initial_chat.room.room_uuid,
          source_channel: resolved_channel,
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
          source_channel: resolved_channel,
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
        ...normalized_error_fields(error),
      },
    })

    return null
  }
}
