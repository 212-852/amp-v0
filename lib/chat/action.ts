import 'server-only'

import { cookies, headers } from 'next/headers'

import {
  infer_source_channel_from_ua,
  type browser_session_source_channel,
} from '@/lib/auth/session'
import { get_request_visitor_uuid } from '@/lib/visitor/request_uuid'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid, uuid_payload_check } from '@/lib/db/uuid_payload'
import { debug_event, forced_debug_event } from '@/lib/debug'
import {
  archive_incoming_line_text,
  archive_message_bundles,
  has_initial_messages,
  load_archived_messages,
  type archived_message,
} from './archive'
import {
  web_chat_timeline_visibility,
  type web_timeline_filtered_row,
} from './web_timeline'
import {
  normalize_dispatch_text,
  resolve_chat_context,
} from '@/lib/dispatch/context'
import {
  build_initial_chat_bundles,
  build_line_followup_ack_bundle,
  build_room_mode_notice_bundle,
  build_room_mode_switch_bundle,
  build_user_text_bundle,
} from './message'
import type { chat_locale } from './message'
import { notify } from '@/lib/notify'
import { normalize_locale } from '@/lib/locale/action'
import {
  ensure_direct_room_for_visitor,
  parse_room_mode,
  resolve_chat_room,
  type chat_channel,
  type chat_room,
  type room_mode,
} from './room'
import {
  resolve_chat_message_action,
  resolve_line_text_mode_switch,
  should_seed_initial_messages,
} from './rules'
import { output_chat_bundles } from '@/lib/output'
import { browser_channel_cookie_name } from '@/lib/visitor/cookie'

type resolve_initial_chat_input = {
  visitor_uuid: string | null
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
  room_uuid: string
  participant_uuid: string
  mode: room_mode
  is_new_room: boolean
  is_seeded: boolean
  messages: archived_message[]
  locale: chat_locale
}

function make_initial_chat_result(input: {
  room: chat_room
  is_new_room: boolean
  is_seeded: boolean
  messages: archived_message[]
  locale: chat_locale
}): initial_chat_result {
  return {
    room: input.room,
    room_uuid: input.room.room_uuid,
    participant_uuid: input.room.participant_uuid,
    mode: input.room.mode,
    is_new_room: input.is_new_room,
    is_seeded: input.is_seeded,
    messages: input.messages,
    locale: input.locale,
  }
}

async function chat_action_log(
  event: string,
  payload: Record<string, unknown>,
) {
  console.log('[chat_action]', event, payload)
  try {
    await forced_debug_event({
      category: 'line_webhook',
      event,
      payload,
    })
  } catch {
    /* never block chat action */
  }
}

async function emit_chat_action_completed(input: {
  reason: string
  room: chat_room
  message_count: number
  is_seeded: boolean
  channel: chat_channel
  extra?: Record<string, unknown>
}) {
  await chat_action_log('chat_action_completed', {
    reason: input.reason,
    room_uuid: input.room.room_uuid || null,
    participant_uuid: input.room.participant_uuid || null,
    mode: input.room.mode,
    channel: input.channel,
    is_seeded: input.is_seeded,
    message_count: input.message_count,
    ...input.extra,
  })
}

type user_page_debug_payload = {
  user_uuid: string | null
  visitor_uuid: string | null
  room_uuid: string | null
  participant_uuid: string | null
  source_channel: chat_channel
  locale: chat_locale
  message_count: number
  has_initial_messages: boolean | null
  error: unknown
}

type user_page_debug_extras = {
  raw_count?: number
  visible_count?: number
  filtered_out?: web_timeline_filtered_row[]
}

function serialize_error(error: unknown): Record<string, unknown> | null {
  if (!error) {
    return null
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        typeof error.cause === 'object' && error.cause !== null
          ? error.cause
          : undefined,
    }
  }

  if (typeof error === 'object') {
    try {
      return JSON.parse(JSON.stringify(error)) as Record<string, unknown>
    } catch {
      return { value: String(error) }
    }
  }

  return { value: String(error) }
}

async function emit_user_page_debug(
  event: string,
  payload: Partial<user_page_debug_payload> & user_page_debug_extras,
) {
  const safe_payload: user_page_debug_payload = {
    user_uuid: payload.user_uuid ?? null,
    visitor_uuid: payload.visitor_uuid ?? null,
    room_uuid: payload.room_uuid ?? null,
    participant_uuid: payload.participant_uuid ?? null,
    source_channel: payload.source_channel ?? 'web',
    locale: payload.locale ?? 'ja',
    message_count: payload.message_count ?? 0,
    has_initial_messages: payload.has_initial_messages ?? null,
    error: payload.error ?? null,
  }

  const timeline_extras: user_page_debug_extras = {}

  if (payload.raw_count !== undefined) {
    timeline_extras.raw_count = payload.raw_count
  }

  if (payload.visible_count !== undefined) {
    timeline_extras.visible_count = payload.visible_count
  }

  if (payload.filtered_out !== undefined) {
    timeline_extras.filtered_out = payload.filtered_out
  }

  await debug_event({
    category: 'USER_PAGE',
    event,
    payload: {
      ...safe_payload,
      ...timeline_extras,
      error: serialize_error(safe_payload.error),
    },
  })
}

async function emit_user_page_message_fetch_completed(
  base: Omit<
    Partial<user_page_debug_payload>,
    'message_count' | 'error'
  >,
  archived_messages: archived_message[],
) {
  const { raw_count, visible_count, filtered_out } =
    web_chat_timeline_visibility(archived_messages)

  await emit_user_page_debug('message_fetch_completed', {
    ...base,
    message_count: raw_count,
    raw_count,
    visible_count,
    filtered_out,
  })

  if (raw_count > visible_count) {
    console.error('[USER_PAGE] message_fetch_visible_gap', {
      raw_count,
      visible_count,
      filtered: filtered_out,
    })
  }
}

async function archive_input_line_text_for_room(input: {
  room: chat_room
  locale: chat_locale
  line_user_id?: string | null
  incoming_line_text?: resolve_initial_chat_input['incoming_line_text']
  bundle?: ReturnType<typeof build_user_text_bundle>
}) {
  if (!input.line_user_id || !input.incoming_line_text) {
    return null
  }

  return archive_incoming_line_text({
    room_uuid: clean_uuid(input.room.room_uuid) ?? input.room.room_uuid,
    participant_uuid:
      clean_uuid(input.room.participant_uuid) ?? input.room.participant_uuid,
    user_uuid: clean_uuid(input.room.user_uuid),
    visitor_uuid: clean_uuid(input.room.visitor_uuid),
    line_user_id: input.line_user_id,
    line_message_id: input.incoming_line_text.line_message_id,
    text: input.incoming_line_text.text,
    created_at: input.incoming_line_text.created_at,
    webhook_event_id:
      input.incoming_line_text.webhook_event_id ?? null,
    delivery_context_redelivery:
      input.incoming_line_text.delivery_context_redelivery ?? null,
    bundle:
      input.bundle ??
      build_user_text_bundle({
        text: input.incoming_line_text.text,
        locale: input.locale,
        content_key: 'line.incoming.text',
      }),
  })
}

function build_line_mode_switch_bundle(input: {
  text: string
  mode: room_mode
  locale: chat_locale
}) {
  return build_user_text_bundle({
    text: input.text,
    locale: input.locale,
    content_key: `room.mode.switch.${input.mode}`,
    metadata: {
      intent: 'switch_mode',
      mode: input.mode,
    },
  })
}

export async function resolve_initial_chat(
  raw_input: resolve_initial_chat_input,
): Promise<initial_chat_result> {
  const input: resolve_initial_chat_input = {
    ...raw_input,
    visitor_uuid: clean_uuid(raw_input.visitor_uuid),
    user_uuid: clean_uuid(raw_input.user_uuid),
  }

  await chat_action_log('chat_action_entered', {
    channel: input.channel,
    locale: input.locale,
    visitor_uuid: input.visitor_uuid,
    user_uuid: input.user_uuid ?? null,
    line_user_id: input.line_user_id ?? null,
    has_reply_token: Boolean(input.line_reply_token),
    incoming_text: input.incoming_line_text?.text ?? null,
  })

  try {
    const room_result = await resolve_chat_room({
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid ?? null,
      channel: input.channel,
      external_room_id: input.external_room_id ?? null,
    })

    if (!room_result.ok || !room_result.room.room_uuid) {
      const fallback = make_initial_chat_result({
        room: room_result.room,
        is_new_room: false,
        is_seeded: false,
        messages: [],
        locale: input.locale,
      })

      await emit_chat_action_completed({
        reason: 'room_resolve_failed',
        room: room_result.room,
        channel: input.channel,
        is_seeded: false,
        message_count: 0,
      })

      return fallback
    }

    if (input.channel === 'line' && input.incoming_line_text) {
      await forced_debug_event({
        category: 'line_webhook',
        event: 'line_dispatch_context_resolved',
        payload: {
          visitor_uuid: room_result.room.visitor_uuid,
          user_uuid: room_result.room.user_uuid,
          participant_uuid: room_result.room.participant_uuid,
          room_uuid: room_result.room.room_uuid,
          locale: input.locale,
          source_channel: room_result.room.channel,
        },
      })
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

      await emit_chat_action_completed({
        reason: 'load_archived_messages_failed',
        room: room_result.room,
        channel: input.channel,
        is_seeded: false,
        message_count: 0,
        extra: { error: serialize_error(error) },
      })

      return make_initial_chat_result({
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: [],
        locale: input.locale,
      })
    }

    const room_has_initial_messages = await has_initial_messages(
      room_result.room.room_uuid,
    )
    const should_seed =
      !room_has_initial_messages &&
      should_seed_initial_messages(archived_messages)
    const incoming_line_text = input.incoming_line_text
    const normalized_line_text = normalize_dispatch_text(
      incoming_line_text?.text,
    )
    const line_switch_mode =
      input.channel === 'line' && normalized_line_text
        ? resolve_line_text_mode_switch({
            text: normalized_line_text,
            locale: input.locale,
          })
        : null

    if (input.channel === 'line') {
      await chat_action_log('chat_action_mode_detected', {
        room_uuid: room_result.room.room_uuid,
        normalized_text: normalized_line_text,
        switch_mode: line_switch_mode,
        current_mode: room_result.room.mode,
        should_seed,
        has_reply_token: Boolean(input.line_reply_token),
      })
    }

    if (
      input.channel === 'line' &&
      input.line_reply_token &&
      input.line_user_id &&
      incoming_line_text &&
      line_switch_mode
    ) {
      const incoming_bundle = build_line_mode_switch_bundle({
        text: normalized_line_text,
        mode: line_switch_mode,
        locale: input.locale,
      })

      const result = await execute_room_mode_switch({
        room: room_result.room,
        locale: input.locale,
        incoming_bundle,
        archive_incoming: () =>
          archive_input_line_text_for_room({
            room: room_result.room,
            locale: input.locale,
            line_user_id: input.line_user_id,
            incoming_line_text,
            bundle: incoming_bundle,
          }),
        line_reply_token: input.line_reply_token,
        line_user_id: input.line_user_id,
      })

      await chat_action_log('chat_action_archive_completed', {
        reason: 'mode_switch',
        room_uuid: room_result.room.room_uuid,
        ok: result.ok,
        message_count: result.ok ? result.messages.length : 0,
      })

      const switched_room: chat_room = {
        ...room_result.room,
        mode: result.ok ? result.mode : room_result.room.mode,
      }
      const final_messages = result.ok
        ? result.messages
        : await load_archived_messages(room_result.room.room_uuid)

      await forced_debug_event({
        category: 'line_webhook',
        event: 'line_chat_action_completed',
        payload: {
          room_uuid: switched_room.room_uuid,
          participant_uuid: switched_room.participant_uuid,
          message_count: final_messages.length,
          mode: switched_room.mode,
        },
      })

      await emit_chat_action_completed({
        reason: 'mode_switch',
        room: switched_room,
        channel: input.channel,
        is_seeded: false,
        message_count: final_messages.length,
        extra: { switch_mode: line_switch_mode },
      })

      return make_initial_chat_result({
        room: switched_room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: final_messages,
        locale: input.locale,
      })
    }

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
          const messages = await load_archived_messages(
            room_result.room.room_uuid,
          )

          await emit_chat_action_completed({
            reason: 'line_duplicate_incoming_skipped',
            room: room_result.room,
            channel: input.channel,
            is_seeded: false,
            message_count: messages.length,
          })

          return make_initial_chat_result({
            room: room_result.room,
            is_new_room: room_result.is_new_room,
            is_seeded: false,
            messages,
            locale: input.locale,
          })
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

        await chat_action_log('chat_action_archive_completed', {
          reason: 'line_followup_ack',
          room_uuid: room_result.room.room_uuid,
          archive_count: outgoing.length,
        })

        await chat_action_log('chat_action_output_started', {
          reason: 'line_followup_ack',
          room_uuid: room_result.room.room_uuid,
          channel: 'line',
          message_count: outgoing.length,
        })

        await output_chat_bundles({
          room: room_result.room,
          channel: 'line',
          messages: outgoing,
          line_reply_token: input.line_reply_token,
          line_user_id: input.line_user_id ?? null,
        })

        const messages = await load_archived_messages(
          room_result.room.room_uuid,
        )

        await emit_chat_action_completed({
          reason: 'line_followup_ack',
          room: room_result.room,
          channel: input.channel,
          is_seeded: false,
          message_count: messages.length,
        })

        return make_initial_chat_result({
          room: room_result.room,
          is_new_room: room_result.is_new_room,
          is_seeded: false,
          messages,
          locale: input.locale,
        })
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

        await chat_action_log('chat_action_archive_completed', {
          reason: 'line_incoming_archive_only',
          room_uuid: room_result.room.room_uuid,
        })
      }

      const messages = await load_archived_messages(
        room_result.room.room_uuid,
      )

      await emit_chat_action_completed({
        reason: input.channel === 'line'
          ? 'line_no_output'
          : 'no_seed_no_output',
        room: room_result.room,
        channel: input.channel,
        is_seeded: false,
        message_count: messages.length,
      })

      return make_initial_chat_result({
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages,
        locale: input.locale,
      })
    }

    try {
      if (input.channel === 'line' && !input.line_reply_token?.trim()) {
        await emit_chat_action_completed({
          reason: 'line_seed_skipped_missing_reply_token',
          room: room_result.room,
          channel: input.channel,
          is_seeded: false,
          message_count: archived_messages.length,
        })

        return make_initial_chat_result({
          room: room_result.room,
          is_new_room: room_result.is_new_room,
          is_seeded: false,
          messages: archived_messages,
          locale: input.locale,
        })
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
        const messages = await load_archived_messages(
          room_result.room.room_uuid,
        )

        await emit_chat_action_completed({
          reason: 'line_duplicate_incoming_skipped_seed',
          room: room_result.room,
          channel: input.channel,
          is_seeded: false,
          message_count: messages.length,
        })

        return make_initial_chat_result({
          room: room_result.room,
          is_new_room: room_result.is_new_room,
          is_seeded: false,
          messages,
          locale: input.locale,
        })
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

      await chat_action_log('chat_action_archive_completed', {
        reason: 'seed_initial_bundles',
        room_uuid: room_result.room.room_uuid,
        archive_count: seeded_messages.length,
      })

      await chat_action_log('chat_action_output_started', {
        reason: 'seed_initial_bundles',
        room_uuid: room_result.room.room_uuid,
        channel: input.channel,
        message_count: seeded_messages.length,
      })

      await output_chat_bundles({
        room: room_result.room,
        channel: input.channel,
        messages: seeded_messages,
        line_reply_token: input.line_reply_token ?? null,
        line_user_id: input.line_user_id ?? null,
      })

      const messages = [
        ...(archived_incoming?.archived_message
          ? [archived_incoming.archived_message]
          : []),
        ...seeded_messages,
      ]

      await emit_chat_action_completed({
        reason: 'seed_initial_bundles',
        room: room_result.room,
        channel: input.channel,
        is_seeded: true,
        message_count: messages.length,
      })

      return make_initial_chat_result({
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: true,
        messages,
        locale: input.locale,
      })
    } catch (error) {
      const e = error as { code?: string; message?: string }
      console.error('[chat_room]', 'room_failed', 'seed_initial_messages', {
        error,
        error_code: e.code,
        error_message: e.message,
        room_uuid: room_result.room.room_uuid,
      })

      await chat_action_log('chat_action_failed', {
        reason: 'seed_initial_messages',
        room_uuid: room_result.room.room_uuid,
        error: serialize_error(error),
      })

      return make_initial_chat_result({
        room: room_result.room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: archived_messages,
        locale: input.locale,
      })
    }
  } catch (error) {
    await chat_action_log('chat_action_failed', {
      reason: 'unexpected',
      channel: input.channel,
      visitor_uuid: input.visitor_uuid,
      line_user_id: input.line_user_id ?? null,
      error: serialize_error(error),
    })

    throw error
  }
}

export async function load_user_home_chat() {
  const fallback_room: chat_room = {
    room_uuid: '',
    participant_uuid: '',
    bot_participant_uuid: '',
    user_uuid: null,
    visitor_uuid: null,
    channel: 'web' as const,
    mode: 'bot' as const,
  }
  const fallback_result: initial_chat_result = make_initial_chat_result({
    room: fallback_room,
    is_new_room: false,
    is_seeded: false,
    messages: [],
    locale: 'ja',
  })

  await emit_user_page_debug('render_started', {})

  try {
    const chat_context = await resolve_chat_context({
      channel: 'web',
    })
    const visitor_uuid = chat_context.visitor_uuid
    const user_uuid = chat_context.user_uuid ?? null
    const source_channel = chat_context.channel
    const locale = chat_context.locale

    await emit_user_page_debug('session_resolved', {
      user_uuid,
      visitor_uuid,
      source_channel,
      locale,
    })

    if (!visitor_uuid) {
      await emit_user_page_debug('render_failed', {
        user_uuid,
        visitor_uuid: null,
        source_channel,
        locale,
        error: {
          message: 'visitor_uuid_missing',
        },
      })

      return fallback_result
    }

    if (chat_context.is_new_visitor) {
      await ensure_direct_room_for_visitor({
        visitor_uuid,
        user_uuid,
        channel: source_channel,
      })
    }

    await emit_user_page_debug('room_resolve_started', {
      user_uuid,
      visitor_uuid,
      source_channel,
      locale,
    })

    const room_result = await resolve_chat_room({
      visitor_uuid,
      user_uuid,
      channel: source_channel,
    })

    if (!room_result.ok || !room_result.room.room_uuid) {
      await emit_user_page_debug('render_failed', {
        user_uuid,
        visitor_uuid,
        source_channel,
        locale,
        error: {
          message: 'room_resolve_failed',
          room_ok: room_result.ok,
        },
      })

      return fallback_result
    }

    const room = room_result.room

    await emit_user_page_debug('room_resolve_completed', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
    })

    await emit_user_page_debug('message_fetch_started', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
    })

    const archived_messages = await load_archived_messages(room.room_uuid)

    await emit_user_page_message_fetch_completed(
      {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        locale,
      },
      archived_messages,
    )

    await emit_user_page_debug('initial_seed_check_started', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
      message_count: archived_messages.length,
    })

    const room_has_initial_messages = await has_initial_messages(
      room.room_uuid,
    )

    if (archived_messages.length > 0) {
      await emit_user_page_debug('initial_seed_skipped', {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        locale,
        message_count: archived_messages.length,
        has_initial_messages: room_has_initial_messages,
      })

      await emit_user_page_debug('render_completed', {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        locale,
        message_count: archived_messages.length,
        has_initial_messages: room_has_initial_messages,
      })

      return make_initial_chat_result({
        room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: archived_messages,
        locale,
      })
    }

    const bundles = build_initial_chat_bundles({ locale })
    await archive_message_bundles({
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      bot_participant_uuid: room.bot_participant_uuid,
      channel: source_channel,
      bundles,
    })

    const final_messages = await load_archived_messages(room.room_uuid)

    await emit_user_page_message_fetch_completed(
      {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        locale,
      },
      final_messages,
    )

    await emit_user_page_debug('initial_seed_created', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
      message_count: final_messages.length,
      has_initial_messages: room_has_initial_messages,
    })

    if (final_messages.length === 0) {
      await emit_user_page_debug('render_failed', {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        locale,
        message_count: 0,
        has_initial_messages: room_has_initial_messages,
        error: { message: 'empty_messages_after_seed' },
      })

      return make_initial_chat_result({
        room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: [],
        locale,
      })
    }

    await emit_user_page_debug('render_completed', {
      user_uuid,
      visitor_uuid,
      room_uuid: room.room_uuid,
      participant_uuid: room.participant_uuid,
      source_channel,
      locale,
      message_count: final_messages.length,
      has_initial_messages: room_has_initial_messages,
    })

    return make_initial_chat_result({
      room,
      is_new_room: room_result.is_new_room,
      is_seeded: true,
      messages: final_messages,
      locale,
    })
  } catch (error) {
    await emit_user_page_debug('render_failed', {
      error,
    })

    return fallback_result
  }
}

type room_mode_switch_result =
  | {
      ok: true
      mode: room_mode
      message_uuid: string | null
      messages: archived_message[]
    }
  | {
      ok: false
      error:
        | 'session_required'
        | 'invalid_mode'
        | 'room_not_found'
        | 'room_mismatch'
        | 'invalid_transition'
    }

async function notify_room_mode_switch(input: {
  room_uuid: string
  participant_uuid: string
  visitor_uuid: string | null
  user_uuid: string | null
  channel: chat_channel
  mode: room_mode
  action_id: string | null
}) {
  const should_notify =
    input.mode === 'concierge' || input.mode === 'bot'
  const notify_category =
    input.mode === 'concierge'
      ? 'concierge_requested'
      : input.mode === 'bot'
        ? 'concierge_closed'
        : null

  console.log('[chat] mode_switch_notify_check', {
    room_uuid: input.room_uuid,
    participant_uuid: input.participant_uuid,
    mode: input.mode,
    should_notify,
    category: notify_category,
    action_id: input.action_id,
  })

  if (!should_notify || !notify_category) {
    return
  }

  try {
    console.log('[chat] notify_action_started', {
      room_uuid: input.room_uuid,
      mode: input.mode,
      category: notify_category,
      action_id: input.action_id,
    })

    const results = await notify(
      input.mode === 'concierge'
        ? {
            event: 'concierge_requested',
            room_uuid: input.room_uuid,
            participant_uuid: input.participant_uuid,
            visitor_uuid: input.visitor_uuid,
            user_uuid: input.user_uuid,
            source_channel: input.channel,
            mode: 'concierge',
            action_id: input.action_id,
          }
        : {
            event: 'concierge_closed',
            room_uuid: input.room_uuid,
            mode: 'bot',
            action_id: input.action_id,
          },
    )

    console.log('[chat] notify_action_completed', {
      room_uuid: input.room_uuid,
      mode: input.mode,
      category: notify_category,
      delivery_count: results.length,
      deliveries: results.map((item) => ({
        channel: item.channel,
        action_id: item.action_id ?? null,
      })),
    })

    const previous_action_id =
      typeof input.action_id === 'string' && input.action_id.trim().length > 0
        ? input.action_id.trim()
        : null

    const discord_delivery = results.find(
      (item) => item.channel === 'discord' && item.action_id,
    )
    const next_action_id =
      typeof discord_delivery?.action_id === 'string' &&
      discord_delivery.action_id.trim().length > 0
        ? discord_delivery.action_id.trim()
        : null

    if (!next_action_id || next_action_id === previous_action_id) {
      return
    }

    await uuid_payload_check({
      room_uuid: input.room_uuid,
      participant_uuid: input.participant_uuid,
      visitor_uuid: input.visitor_uuid,
      user_uuid: input.user_uuid,
    })

    const result = await supabase
      .from('rooms')
      .update({
        action_id: next_action_id,
        updated_at: new Date().toISOString(),
      })
      .eq('room_uuid', input.room_uuid)

    if (result.error) {
      throw result.error
    }

    console.log('[chat] discord_action_id_saved', {
      room_uuid: input.room_uuid,
      action_id: next_action_id,
    })
  } catch (error) {
    console.error('[chat] notify_action_failed', {
      room_uuid: input.room_uuid,
      mode: input.mode,
      category: notify_category,
      error: serialize_error(error),
    })
  }
}

async function execute_room_mode_switch(input: {
  room: chat_room
  locale: chat_locale
  incoming_bundle: ReturnType<typeof build_user_text_bundle>
  archive_incoming?: (() => Promise<{
    archived_message: archived_message | null
    is_duplicate: boolean
  } | null>) | null
  line_reply_token?: string | null
  line_user_id?: string | null
}): Promise<room_mode_switch_result> {
  const switch_action = resolve_chat_message_action(input.incoming_bundle)

  if (switch_action.action !== 'switch_room_mode') {
    return { ok: false, error: 'invalid_transition' }
  }

  const archived_incoming = input.archive_incoming
    ? await input.archive_incoming()
    : null

  if (archived_incoming?.is_duplicate) {
    return {
      ok: true,
      mode: input.room.mode,
      message_uuid: archived_incoming.archived_message?.archive_uuid ?? null,
      messages: archived_incoming.archived_message
        ? [archived_incoming.archived_message]
        : [],
    }
  }

  await uuid_payload_check({
    room_uuid: input.room.room_uuid,
    participant_uuid: input.room.participant_uuid,
    visitor_uuid: input.room.visitor_uuid,
    user_uuid: input.room.user_uuid,
  })

  const room_update = await supabase
    .from('rooms')
    .update({
      mode: switch_action.mode,
      updated_at: new Date().toISOString(),
    })
    .eq('room_uuid', input.room.room_uuid)
    .select('mode, action_id')
    .maybeSingle()

  if (room_update.error) {
    throw room_update.error
  }

  if (!room_update.data) {
    return { ok: false, error: 'room_not_found' }
  }

  const chat_room_after_mode: chat_room = {
    ...input.room,
    mode: parse_room_mode(room_update.data.mode),
  }
  const confirmation_bundle = build_room_mode_notice_bundle({
    notice:
      switch_action.mode === 'concierge'
        ? 'concierge_requested'
        : 'resumed_bot',
    locale: input.locale,
  })

  const outgoing_messages = await archive_message_bundles({
    room_uuid: chat_room_after_mode.room_uuid,
    participant_uuid: chat_room_after_mode.participant_uuid,
    bot_participant_uuid: chat_room_after_mode.bot_participant_uuid,
    channel: chat_room_after_mode.channel,
    bundles: input.archive_incoming
      ? [confirmation_bundle]
      : [input.incoming_bundle, confirmation_bundle],
  })
  const archived_messages = [
    ...(archived_incoming?.archived_message
      ? [archived_incoming.archived_message]
      : []),
    ...outgoing_messages,
  ]

  await output_chat_bundles({
    room: chat_room_after_mode,
    channel: chat_room_after_mode.channel,
    messages:
      chat_room_after_mode.channel === 'line'
        ? outgoing_messages
        : archived_messages,
    line_reply_token: input.line_reply_token ?? null,
    line_user_id: input.line_user_id ?? null,
  })

  await notify_room_mode_switch({
    room_uuid: chat_room_after_mode.room_uuid,
    participant_uuid: chat_room_after_mode.participant_uuid,
    visitor_uuid: chat_room_after_mode.visitor_uuid,
    user_uuid: chat_room_after_mode.user_uuid,
    channel: chat_room_after_mode.channel,
    mode: chat_room_after_mode.mode,
    action_id:
      typeof room_update.data.action_id === 'string'
        ? room_update.data.action_id
        : null,
  })

  return {
    ok: true,
    mode: chat_room_after_mode.mode,
    message_uuid: archived_messages[0]?.archive_uuid ?? null,
    messages: archived_messages,
  }
}

function resolve_session_source_channel(
  browser_channel_cookie: string | null,
  session_channel: browser_session_source_channel,
  user_agent: string | null,
): browser_session_source_channel {
  const raw = browser_channel_cookie?.trim().toLowerCase()

  if (raw === 'liff' || raw === 'pwa') {
    return raw
  }

  if (
    session_channel === 'liff' ||
    session_channel === 'pwa' ||
    session_channel === 'line'
  ) {
    return session_channel
  }

  return infer_source_channel_from_ua(user_agent)
}

function session_source_to_chat_channel(
  source_channel: browser_session_source_channel,
): chat_channel {
  if (source_channel === 'web') {
    return 'web'
  }

  if (source_channel === 'line') {
    return 'liff'
  }

  return source_channel
}

export async function handle_chat_mode_request(
  request: Request,
): Promise<{ status: number; body: room_mode_switch_result }> {
  const visitor_uuid = await get_request_visitor_uuid()

  if (!visitor_uuid) {
    return {
      status: 401,
      body: { ok: false, error: 'session_required' },
    }
  }

  const body = (await request.json().catch(() => null)) as {
    room_uuid?: string
    participant_uuid?: string
    locale?: string
    mode?: room_mode
  } | null

  if (
    !body?.room_uuid ||
    !body.participant_uuid ||
    (body.mode !== 'bot' && body.mode !== 'concierge')
  ) {
    return {
      status: 400,
      body: { ok: false, error: 'invalid_mode' },
    }
  }

  const header_store = await headers()
  const cookie_store = await cookies()
  const user_agent = header_store.get('user-agent')
  const source_channel = resolve_session_source_channel(
    cookie_store.get(browser_channel_cookie_name)?.value ?? null,
    infer_source_channel_from_ua(user_agent),
    user_agent,
  )
  const channel = session_source_to_chat_channel(source_channel)
  const locale = normalize_locale(body.locale) as chat_locale
  const incoming_bundle = build_room_mode_switch_bundle({
    mode: body.mode,
    locale,
  })
  const switch_action = resolve_chat_message_action(incoming_bundle)

  if (switch_action.action !== 'switch_room_mode') {
    return {
      status: 400,
      body: { ok: false, error: 'invalid_transition' },
    }
  }

  const participant_result = await supabase
    .from('participants')
    .select('participant_uuid, room_uuid, visitor_uuid, user_uuid')
    .eq('participant_uuid', body.participant_uuid)
    .eq('room_uuid', body.room_uuid)
    .eq('role', 'user')
    .maybeSingle()

  if (participant_result.error) {
    throw participant_result.error
  }

  if (
    !participant_result.data ||
    participant_result.data.visitor_uuid !== visitor_uuid
  ) {
    return {
      status: 403,
      body: { ok: false, error: 'room_mismatch' },
    }
  }

  const bot_participant_result = await supabase
    .from('participants')
    .select('participant_uuid')
    .eq('room_uuid', body.room_uuid)
    .eq('role', 'bot')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (bot_participant_result.error) {
    throw bot_participant_result.error
  }

  if (!bot_participant_result.data?.participant_uuid) {
    return {
      status: 404,
      body: { ok: false, error: 'room_not_found' },
    }
  }

  const chat_room: chat_room = {
    room_uuid: body.room_uuid,
    participant_uuid: body.participant_uuid,
    bot_participant_uuid: bot_participant_result.data.participant_uuid,
    user_uuid: participant_result.data.user_uuid ?? null,
    visitor_uuid,
    channel,
    mode: switch_action.mode,
  }

  const result = await execute_room_mode_switch({
    room: chat_room,
    locale,
    incoming_bundle,
  })

  return {
    status: result.ok ? 200 : 400,
    body: result,
  }
}
