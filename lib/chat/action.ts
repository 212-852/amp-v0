import 'server-only'

import { after } from 'next/server'
import { cookies, headers } from 'next/headers'

import {
  infer_source_channel_from_ua,
  type browser_session_source_channel,
} from '@/lib/auth/session'
import { get_request_visitor_uuid } from '@/lib/visitor/request'
import { supabase } from '@/lib/db/supabase'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { debug_event } from '@/lib/debug'
import { emit_message_send_diagnostic_pair } from '@/lib/debug/message_send_diagnostic'
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
} from './web/timeline'
import {
  normalize_dispatch_text,
  resolve_chat_context,
} from '@/lib/dispatch/context'
import {
  build_initial_chat_bundles,
  build_line_followup_ack_bundle,
  build_room_mode_notice_bundle,
  build_room_action_log_bundle,
  build_room_mode_switch_bundle,
  build_staff_text_bundle,
  build_user_text_bundle,
  pick_room_mode_notice_text,
} from './message'
import { deliver_line_text_reply } from '@/lib/output/line'
import type { chat_locale } from './message'
import { insert_support_started_action, merge_support_started_notify_meta_into_chat_action } from '@/lib/actions/support_started'
import { public_actions_table_name } from '@/lib/actions/table'
import { notify } from '@/lib/notify'
import {
  mask_discord_action_id_for_log,
  normalize_discord_thread_action_id,
} from '@/lib/notify/discord'
import { normalize_locale } from '@/lib/locale/action'
import { fetch_user_profile_json } from '@/lib/users/profile_json'
import {
  ensure_direct_room_for_visitor,
  parse_room_mode,
  resolve_admin_reception_send_context,
  resolve_chat_room,
  resolve_user_room,
  type chat_channel,
  type chat_room,
  type room_mode,
} from './room'
import {
  can_switch_to_concierge,
  resolve_chat_message_action,
  should_seed_initial_messages,
} from './rules'
import { decide_bot_action } from './bot/rules'
import { output_chat_bundles } from '@/lib/output'
import { browser_channel_cookie_name, client_source_channel_header_name } from '@/lib/visitor/cookie'
import { get_session_user } from '@/lib/auth/route'
import { resolve_handoff_memo_saved_by_name } from '@/lib/admin/profile'
import { resolve_room_subject } from '@/lib/admin/reception/room'
import {
  create_handoff_memo as create_handoff_memo_core,
  type handoff_memo_debug_context,
  list_handoff_memos as list_handoff_memos_core,
  type create_handoff_memo_input,
} from './memo'
export type { handoff_memo } from './handoff'

export async function list_handoff_memos(input: {
  room_uuid: string
  debug?: handoff_memo_debug_context
}) {
  return list_handoff_memos_core(input)
}

export async function create_handoff_memo(input: create_handoff_memo_input) {
  return create_handoff_memo_core(input)
}

type resolve_initial_chat_input = {
  visitor_uuid: string | null
  user_uuid?: string | null
  channel: chat_channel
  locale: chat_locale
  /** PWA session GET: false when visitor has no user_uuid (do not seed welcome). */
  session_restored?: boolean | null
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

type concierge_eligibility = {
  allowed: boolean
  role: string | null
  tier: string | null
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

function room_has_duplicate_welcome_body(
  archived_messages: archived_message[],
  locale: chat_locale,
): boolean {
  const bundles = build_initial_chat_bundles({ locale })
  const welcome = bundles.find((b) => b.bundle_type === 'welcome')

  if (!welcome || welcome.bundle_type !== 'welcome') {
    return false
  }

  const target = welcome.payload.text.trim()

  if (!target) {
    return false
  }

  return archived_messages.some((row) => {
    const bundle = row.bundle

    if (bundle.bundle_type !== 'welcome') {
      return false
    }

    if (!('payload' in bundle) || !bundle.payload) {
      return false
    }

    const payload = bundle.payload as { text?: unknown }
    const text =
      typeof payload.text === 'string' ? payload.text.trim() : ''

    return text === target
  })
}

async function chat_action_log(
  event: string,
  payload: Record<string, unknown>,
) {
  if (
    event.endsWith('_failed') ||
    String(payload.reason ?? '').includes('failed')
  ) {
    console.error('[chat_action_failed]', event, payload)
  }
}

async function resolve_user_concierge_eligibility(
  user_uuid: string | null | undefined,
): Promise<concierge_eligibility> {
  const sanitized_user_uuid = clean_uuid(user_uuid)

  if (!sanitized_user_uuid) {
    return {
      allowed: false,
      role: null,
      tier: null,
    }
  }

  const result = await supabase
    .from('users')
    .select('role, tier')
    .eq('user_uuid', sanitized_user_uuid)
    .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const row = result.data as { role: string | null; tier: string | null } | null
  const role = row?.role ?? null
  const tier = row?.tier ?? null

  return {
    allowed: can_switch_to_concierge({ role, tier }),
    role,
    tier,
  }
}

async function current_session_concierge_eligibility(): Promise<concierge_eligibility> {
  const session = await get_session_user()
  const role = session.role
  const tier = session.tier

  return {
    allowed: can_switch_to_concierge({ role, tier }),
    role,
    tier,
  }
}

function concierge_link_required_result(): room_mode_switch_result {
  return {
    ok: false,
    error: 'link_required',
    reason: 'concierge_requires_member',
  }
}

function link_required_line_text(locale: chat_locale) {
  if (locale === 'en') {
    return 'Account linking is required to contact the concierge. Please link your account first.'
  }

  if (locale === 'es') {
    return 'Necesitas vincular tu cuenta para consultar al concierge. Vincula tu cuenta primero.'
  }

  return 'コンシェルジュに相談するには連携が必要です。先にアカウント連携をお願いします。'
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

  try {
    const room_result = input.external_room_id
      ? await resolve_chat_room({
          visitor_uuid: input.visitor_uuid,
          user_uuid: input.user_uuid ?? null,
          channel: input.channel,
          external_room_id: input.external_room_id ?? null,
        })
      : await (async () => {
          const resolved = await resolve_user_room({
            visitor_uuid: input.visitor_uuid,
            user_uuid: input.user_uuid ?? null,
            channel: input.channel,
            source_channel: input.channel,
          })

          if (!resolved.ok) {
            return {
              ok: false as const,
              room: {
                room_uuid: '',
                participant_uuid: '',
                bot_participant_uuid: '',
                user_uuid: input.user_uuid ?? null,
                visitor_uuid: input.visitor_uuid,
                channel: input.channel,
                mode: 'bot' as const,
              },
              is_new_room: false as const,
            }
          }

          return {
            ok: true as const,
            room: {
              room_uuid: resolved.room_uuid,
              participant_uuid: resolved.participant_uuid,
              bot_participant_uuid: resolved.bot_participant_uuid,
              user_uuid: input.user_uuid ?? null,
              visitor_uuid: input.visitor_uuid,
              channel: resolved.channel,
              mode: resolved.mode,
            },
            is_new_room: resolved.is_new_room,
          }
        })()

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
    const reopen_guard =
      (input.channel === 'pwa' || input.channel === 'web') &&
      !room_result.is_new_room &&
      archived_messages.length > 0

    const skip_welcome_guest_pwa =
      input.channel === 'pwa' && !input.user_uuid

    const skip_session_restore_failed_pwa =
      input.channel === 'pwa' && input.session_restored === false

    const duplicate_welcome_body = room_has_duplicate_welcome_body(
      archived_messages,
      input.locale,
    )

    const should_seed =
      !room_has_initial_messages &&
      should_seed_initial_messages(archived_messages) &&
      !reopen_guard &&
      !skip_welcome_guest_pwa &&
      !skip_session_restore_failed_pwa &&
      !duplicate_welcome_body

    if (!should_seed && should_seed_initial_messages(archived_messages)) {
      const skip_reason = skip_welcome_guest_pwa
        ? 'user_uuid_missing'
        : skip_session_restore_failed_pwa
          ? 'session_restore_failed'
          : duplicate_welcome_body
            ? 'duplicate_welcome_body'
            : room_has_initial_messages
              ? 'room_has_initial_messages'
              : reopen_guard
                ? 'reopen_existing_room_with_message_history'
                : null

      if (skip_reason) {
        await debug_event({
          category: 'pwa',
          event: 'welcome_message_skipped',
          payload: {
            reason: skip_reason,
            room_uuid: room_result.room.room_uuid,
            visitor_uuid: input.visitor_uuid,
            user_uuid: input.user_uuid ?? null,
            source_channel: input.channel,
            phase: 'resolve_initial_chat',
          },
        })
      }
    }

    const incoming_line_text = input.incoming_line_text
    const normalized_line_text = normalize_dispatch_text(
      incoming_line_text?.text,
    )
    const line_bot_decision =
      input.channel === 'line' && normalized_line_text
        ? decide_bot_action({
            text: normalized_line_text,
            locale: input.locale,
            current_mode: room_result.room.mode,
            source_channel: room_result.room.channel,
          })
        : null
    const line_switch_mode =
      line_bot_decision?.action === 'switch_mode'
        ? line_bot_decision.mode ?? null
        : null

    if (input.channel === 'line') {
      await chat_action_log('line_bot_decision', {
        room_uuid: room_result.room.room_uuid,
        normalized_text: normalized_line_text,
        decision: line_bot_decision,
        current_mode: room_result.room.mode,
      })
    }

    if (
      input.channel === 'line' &&
      input.line_reply_token &&
      input.line_user_id &&
      incoming_line_text &&
      line_switch_mode
    ) {
      if (line_switch_mode === 'concierge') {
        const eligibility = await resolve_user_concierge_eligibility(
          room_result.room.user_uuid,
        )

        if (!eligibility.allowed) {
          let reply_status: number | null = null

          try {
            reply_status = await deliver_line_text_reply({
              reply_token: input.line_reply_token,
              text: link_required_line_text(input.locale),
            })
          } catch (error) {
            console.error('[line_reply_failed]', {
              room_uuid: room_result.room.room_uuid,
              line_user_id: input.line_user_id,
              switch_mode: line_switch_mode,
              error: serialize_error(error),
            })
          }

          await archive_input_line_text_for_room({
            room: room_result.room,
            locale: input.locale,
            line_user_id: input.line_user_id,
            incoming_line_text,
            bundle: build_user_text_bundle({
              text: normalized_line_text,
              locale: input.locale,
              content_key: 'room.mode.link_required',
              metadata: {
                intent: 'link_required',
                requested_mode: 'concierge',
              },
            }),
          })

          await emit_chat_action_completed({
            reason: 'mode_switch_link_required',
            room: room_result.room,
            channel: input.channel,
            is_seeded: false,
            message_count: 0,
            extra: {
              switch_mode: line_switch_mode,
              reply_status,
              deferred: false,
            },
          })

          return make_initial_chat_result({
            room: room_result.room,
            is_new_room: room_result.is_new_room,
            is_seeded: false,
            messages: [],
            locale: input.locale,
          })
        }
      }

      const incoming_bundle = build_line_mode_switch_bundle({
        text: normalized_line_text,
        mode: line_switch_mode,
        locale: input.locale,
      })
      const confirmation_text = pick_room_mode_notice_text({
        notice:
          line_switch_mode === 'concierge'
            ? 'concierge_requested'
            : 'resumed_bot',
        locale: input.locale,
      })

      let reply_status: number | null = null

      try {
        reply_status = await deliver_line_text_reply({
          reply_token: input.line_reply_token,
          text: confirmation_text,
        })
      } catch (error) {
        console.error('[line_reply_failed]', {
          room_uuid: room_result.room.room_uuid,
          line_user_id: input.line_user_id,
          switch_mode: line_switch_mode,
          error: serialize_error(error),
        })
      }

      const post_reply_input = {
        room: room_result.room,
        locale: input.locale,
        line_user_id: input.line_user_id,
        switch_mode: line_switch_mode,
        incoming_bundle,
        incoming_line_text,
      } as const

      schedule_post_reply_switch_mode(post_reply_input)

      const optimistic_room: chat_room = {
        ...room_result.room,
        mode: line_switch_mode,
      }

      await emit_chat_action_completed({
        reason: 'mode_switch_fast_reply',
        room: optimistic_room,
        channel: input.channel,
        is_seeded: false,
        message_count: 0,
        extra: {
          switch_mode: line_switch_mode,
          reply_status,
          deferred: true,
        },
      })

      return make_initial_chat_result({
        room: optimistic_room,
        is_new_room: room_result.is_new_room,
        is_seeded: false,
        messages: [],
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

      await debug_event({
        category: 'pwa',
        event: 'welcome_message_created',
        payload: {
          room_uuid: room_result.room.room_uuid,
          visitor_uuid: input.visitor_uuid,
          user_uuid: input.user_uuid ?? null,
          source_channel: input.channel,
          phase: 'resolve_initial_chat',
        },
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

async function resolve_home_page_browser_chat_channel(): Promise<chat_channel> {
  const header_store = await headers()
  const cookie_store = await cookies()
  const user_agent = header_store.get('user-agent')
  const client_raw = header_store
    .get(client_source_channel_header_name)
    ?.trim()
    .toLowerCase()

  if (client_raw === 'liff' || client_raw === 'pwa') {
    return client_raw === 'liff' ? 'liff' : 'pwa'
  }

  const browser_raw = cookie_store
    .get(browser_channel_cookie_name)
    ?.value?.trim()
    .toLowerCase()

  if (browser_raw === 'liff' || browser_raw === 'pwa') {
    return browser_raw === 'liff' ? 'liff' : 'pwa'
  }

  return session_source_to_chat_channel(infer_source_channel_from_ua(user_agent))
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
    let home_chat_channel = await resolve_home_page_browser_chat_channel()

    let chat_context = await resolve_chat_context({
      channel: home_chat_channel,
    })
    let visitor_uuid = chat_context.visitor_uuid
    let user_uuid = chat_context.user_uuid ?? null
    let source_channel = chat_context.channel
    let locale = chat_context.locale

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

    async function ensure_and_resolve_room(): Promise<
      Awaited<ReturnType<typeof resolve_chat_room>>
    > {
      await ensure_direct_room_for_visitor({
        visitor_uuid: visitor_uuid!,
        user_uuid,
        channel: source_channel,
      })

      await emit_user_page_debug('room_resolve_started', {
        user_uuid,
        visitor_uuid,
        source_channel,
        locale,
      })

      return resolve_chat_room({
        visitor_uuid: visitor_uuid!,
        user_uuid,
        channel: source_channel,
      })
    }

    let room_result = await ensure_and_resolve_room()

    if (
      (!room_result.ok || !room_result.room.room_uuid) &&
      user_uuid &&
      home_chat_channel === 'web'
    ) {
      await emit_user_page_debug('room_resolve_retry_channel', {
        user_uuid,
        visitor_uuid,
        room_uuid: null,
        participant_uuid: null,
        source_channel: 'pwa',
        locale,
        message_count: 0,
        has_initial_messages: null,
        error: {
          message: 'retry_after_web_channel_room_failed',
          from_channel: home_chat_channel,
          to_channel: 'pwa',
        },
      })

      home_chat_channel = 'pwa'
      chat_context = await resolve_chat_context({
        channel: 'pwa',
      })
      visitor_uuid = chat_context.visitor_uuid
      user_uuid = chat_context.user_uuid ?? null
      source_channel = chat_context.channel
      locale = chat_context.locale

      if (!visitor_uuid) {
        await emit_user_page_debug('render_failed', {
          user_uuid,
          visitor_uuid: null,
          source_channel,
          locale,
          error: {
            message: 'visitor_uuid_missing_after_pwa_retry',
          },
        })

        return fallback_result
      }

      room_result = await ensure_and_resolve_room()
    }

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
    await debug_event({
      category: 'chat_room',
      event: 'chat_messages_fetch_started',
      payload: {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        reason: 'load_user_home_chat',
      },
    })

    const archived_messages = await load_archived_messages(room.room_uuid)
    await debug_event({
      category: 'chat_room',
      event: 'chat_messages_fetch_succeeded',
      payload: {
        user_uuid,
        visitor_uuid,
        room_uuid: room.room_uuid,
        participant_uuid: room.participant_uuid,
        source_channel,
        message_count: archived_messages.length,
        reason: 'load_user_home_chat',
      },
    })

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
        | 'link_required'
      reason?: 'concierge_requires_member'
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

    const notify_out = await notify(
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
      delivery_count: notify_out.deliveries.length,
      deliveries: notify_out.deliveries.map((item) => ({
        channel: item.channel,
        action_id: item.action_id ?? null,
      })),
    })

    const previous_action_id =
      typeof input.action_id === 'string' && input.action_id.trim().length > 0
        ? input.action_id.trim()
        : null

    const discord_delivery = notify_out.deliveries.find(
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

type post_reply_switch_mode_input = {
  room: chat_room
  locale: chat_locale
  line_user_id: string
  switch_mode: room_mode
  incoming_bundle: ReturnType<typeof build_user_text_bundle>
  incoming_line_text: NonNullable<
    resolve_initial_chat_input['incoming_line_text']
  >
}

function schedule_post_reply_switch_mode(
  input: post_reply_switch_mode_input,
): void {
  try {
    after(() => run_post_reply_switch_mode(input))
  } catch {
    void run_post_reply_switch_mode(input).catch(() => {
      /* never crash request lifecycle */
    })
  }
}

async function run_post_reply_switch_mode(
  input: post_reply_switch_mode_input,
): Promise<void> {
  const started_at = Date.now()

  try {
    await execute_room_mode_switch({
      room: input.room,
      locale: input.locale,
      incoming_bundle: input.incoming_bundle,
      archive_incoming: () =>
        archive_input_line_text_for_room({
          room: input.room,
          locale: input.locale,
          line_user_id: input.line_user_id,
          incoming_line_text: input.incoming_line_text,
          bundle: input.incoming_bundle,
        }),
      line_reply_token: null,
      line_user_id: input.line_user_id,
      skip_output: true,
    })

  } catch (error) {
    await chat_action_log('post_reply_action_failed', {
      room_uuid: input.room.room_uuid,
      line_user_id: input.line_user_id,
      switch_mode: input.switch_mode,
      error: serialize_error(error),
      duration_ms: Date.now() - started_at,
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
  skip_output?: boolean
}): Promise<room_mode_switch_result> {
  const switch_action = resolve_chat_message_action(input.incoming_bundle)

  if (switch_action.action !== 'switch_room_mode') {
    return { ok: false, error: 'invalid_transition' }
  }

  if (switch_action.mode === 'concierge') {
    const eligibility = await resolve_user_concierge_eligibility(
      input.room.user_uuid,
    )

    if (!eligibility.allowed) {
      return concierge_link_required_result()
    }
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

  if (!input.skip_output) {
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
  }

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

type web_chat_room_resolve_error =
  | 'room_mismatch'
  | 'room_not_found'

type web_chat_room_resolve_result =
  | { ok: true; chat_room: chat_room }
  | {
      ok: false
      response: {
        status: number
        body: { ok: false; error: web_chat_room_resolve_error }
      }
    }

async function resolve_web_chat_room_for_request(input: {
  visitor_uuid: string
  room_uuid: string
  participant_uuid: string
  mode: room_mode
}): Promise<web_chat_room_resolve_result> {
  const header_store = await headers()
  const cookie_store = await cookies()
  const user_agent = header_store.get('user-agent')
  const source_channel = resolve_session_source_channel(
    cookie_store.get(browser_channel_cookie_name)?.value ?? null,
    infer_source_channel_from_ua(user_agent),
    user_agent,
  )
  const channel = session_source_to_chat_channel(source_channel)

  const participant_result = await supabase
    .from('participants')
    .select('participant_uuid, room_uuid, visitor_uuid, user_uuid')
    .eq('participant_uuid', input.participant_uuid)
    .eq('room_uuid', input.room_uuid)
    .eq('role', 'user')
    .maybeSingle()

  if (participant_result.error) {
    throw participant_result.error
  }

  if (
    !participant_result.data ||
    participant_result.data.visitor_uuid !== input.visitor_uuid
  ) {
    return {
      ok: false,
      response: {
        status: 403,
        body: { ok: false, error: 'room_mismatch' },
      },
    }
  }

  const bot_participant_result = await supabase
    .from('participants')
    .select('participant_uuid')
    .eq('room_uuid', input.room_uuid)
    .eq('role', 'bot')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (bot_participant_result.error) {
    throw bot_participant_result.error
  }

  if (!bot_participant_result.data?.participant_uuid) {
    return {
      ok: false,
      response: {
        status: 404,
        body: { ok: false, error: 'room_not_found' },
      },
    }
  }

  return {
    ok: true,
    chat_room: {
      room_uuid: input.room_uuid,
      participant_uuid: input.participant_uuid,
      bot_participant_uuid: bot_participant_result.data.participant_uuid,
      user_uuid: clean_uuid(participant_result.data.user_uuid),
      visitor_uuid: input.visitor_uuid,
      channel,
      mode: input.mode,
    },
  }
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

  const locale = normalize_locale(body.locale) as chat_locale

  if (body.mode === 'concierge') {
    const eligibility = await current_session_concierge_eligibility()

    if (!eligibility.allowed) {
      return {
        status: 403,
        body: concierge_link_required_result(),
      }
    }
  }

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

  const room_resolved = await resolve_web_chat_room_for_request({
    visitor_uuid,
    room_uuid: body.room_uuid,
    participant_uuid: body.participant_uuid,
    mode: switch_action.mode,
  })

  if (!room_resolved.ok) {
    return room_resolved.response
  }

  const result = await execute_room_mode_switch({
    room: room_resolved.chat_room,
    locale,
    incoming_bundle,
  })

  return {
    status: result.ok ? 200 : 400,
    body: result,
  }
}

export type chat_message_request_result =
  | {
      ok: true
      kind: 'switch_mode'
      mode: room_mode
      messages: archived_message[]
    }
  | {
      ok: true
      kind: 'plain_text'
      messages: archived_message[]
    }
  | {
      ok: false
      error: string
      reason?: string
    }

type chat_message_send_debug_event =
  | 'chat_message_send_started'
  | 'chat_message_send_blocked'
  | 'chat_message_send_failed'
  | 'chat_message_send_succeeded'

function chat_message_error_fields(error: unknown) {
  if (!error || typeof error !== 'object') {
    return {
      error_code: null,
      error_message: error ? String(error) : null,
      error_details: null,
      error_hint: null,
    }
  }

  const source = error as {
    code?: unknown
    message?: unknown
    details?: unknown
    hint?: unknown
  }

  return {
    error_code: typeof source.code === 'string' ? source.code : null,
    error_message:
      typeof source.message === 'string' ? source.message : String(error),
    error_details:
      typeof source.details === 'string' ? source.details : null,
    error_hint: typeof source.hint === 'string' ? source.hint : null,
  }
}

async function emit_chat_message_send_debug(input: {
  event: chat_message_send_debug_event
  room_uuid: string | null
  sender_user_uuid?: string | null
  sender_participant_uuid?: string | null
  sender_role?: string | null
  source_channel?: chat_channel | null
  body_length?: number | null
  phase: string
  error?: unknown
  error_code?: string | null
  error_message?: string | null
  error_details?: string | null
  error_hint?: string | null
  extra?: Record<string, unknown>
}) {
  const from_error = input.error ? chat_message_error_fields(input.error) : null

  await debug_event({
    category: 'chat_message',
    event: input.event,
    payload: {
      room_uuid: input.room_uuid,
      sender_user_uuid: input.sender_user_uuid ?? null,
      sender_participant_uuid: input.sender_participant_uuid ?? null,
      sender_role: input.sender_role ?? null,
      source_channel: input.source_channel ?? 'web',
      body_length: input.body_length ?? null,
      error_code: input.error_code ?? from_error?.error_code ?? null,
      error_message:
        input.error_message ?? from_error?.error_message ?? null,
      error_details:
        input.error_details ?? from_error?.error_details ?? null,
      error_hint: input.error_hint ?? from_error?.error_hint ?? null,
      phase: input.phase,
      ...(input.extra ?? {}),
    },
  })
}

async function emit_chat_realtime_support_debug(input: {
  event:
    | 'chat_support_started_insert_started'
    | 'chat_support_started_insert_succeeded'
    | 'chat_support_started_insert_failed'
  room_uuid: string | null
  participant_uuid?: string | null
  user_uuid?: string | null
  role?: string | null
  tier?: string | null
  source_channel?: chat_channel | null
  payload_message_uuid?: string | null
  payload_action_uuid?: string | null
  phase: string
  error?: unknown
}) {
  const from_error = input.error ? chat_message_error_fields(input.error) : null

  await debug_event({
    category: 'chat_realtime',
    event: input.event,
    payload: {
      room_uuid: input.room_uuid,
      active_room_uuid: input.room_uuid,
      participant_uuid: input.participant_uuid ?? null,
      user_uuid: input.user_uuid ?? null,
      role: input.role ?? null,
      tier: input.tier ?? null,
      source_channel: input.source_channel ?? 'web',
      event_name: 'support_started',
      schema: 'public',
      table: 'messages',
      filter: input.room_uuid ? `room_uuid=eq.${input.room_uuid}` : null,
      payload_room_uuid: input.room_uuid,
      payload_message_uuid: input.payload_message_uuid ?? null,
      payload_action_uuid: input.payload_action_uuid ?? null,
      sender_user_uuid: input.user_uuid ?? null,
      sender_role: 'admin',
      error_code: from_error?.error_code ?? null,
      error_message: from_error?.error_message ?? null,
      error_details: from_error?.error_details ?? null,
      error_hint: from_error?.error_hint ?? null,
      phase: input.phase,
    },
  })
}

export type admin_reception_room_open_result =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string }

export async function handle_admin_reception_room_opened(
  request: Request,
): Promise<{ status: number; body: admin_reception_room_open_result }> {
  const body = (await request.json().catch(() => null)) as {
    room_uuid?: string
  } | null

  const room_uuid = clean_uuid(body?.room_uuid)

  if (!room_uuid) {
    return {
      status: 400,
      body: { ok: false, error: 'invalid_room' },
    }
  }

  const session = await get_session_user()

  if (session.role !== 'admin' || !session.user_uuid) {
    return {
      status: 403,
      body: { ok: false, error: 'forbidden' },
    }
  }

  const admin_uuid = clean_uuid(session.user_uuid)

  if (!admin_uuid) {
    return {
      status: 400,
      body: { ok: false, error: 'invalid_room' },
    }
  }

  const recent = await supabase
    .from('messages')
    .select('message_uuid, body, created_at')
    .eq('room_uuid', room_uuid)
    .order('created_at', { ascending: false })
    .limit(20)

  if (recent.error) {
    throw recent.error
  }

  const now_ms = Date.now()

  for (const row of (recent.data ?? []) as {
    body: string | null
    created_at: string
  }[]) {
    try {
      const parsed = JSON.parse(row.body ?? '{}') as {
        bundle?: {
          content_key?: string
          metadata?: { admin_user_uuid?: string }
        }
      }
      const key = parsed?.bundle?.content_key
      const row_admin = clean_uuid(
        parsed?.bundle?.metadata?.admin_user_uuid ?? null,
      )

      if (
        key === 'room.reception.admin_opened' &&
        row_admin &&
        row_admin === admin_uuid
      ) {
        const created = new Date(row.created_at).getTime()

        if (!Number.isNaN(created) && now_ms - created < 25_000) {
          return {
            status: 200,
            body: { ok: true, skipped: true },
          }
        }
      }
    } catch {
      continue
    }
  }

  const [user_result, bot_result, admin_participant_pick] = await Promise.all([
    supabase
      .from('participants')
      .select('participant_uuid, user_uuid')
      .eq('room_uuid', room_uuid)
      .eq('role', 'user')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('participants')
      .select('participant_uuid')
      .eq('room_uuid', room_uuid)
      .eq('role', 'bot')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('participants')
      .select('participant_uuid')
      .eq('room_uuid', room_uuid)
      .eq('user_uuid', admin_uuid)
      .in('role', ['admin', 'concierge'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (user_result.error) {
    throw user_result.error
  }

  if (bot_result.error) {
    throw bot_result.error
  }

  if (admin_participant_pick.error) {
    throw admin_participant_pick.error
  }

  const user_participant_uuid = clean_uuid(
    (user_result.data as { participant_uuid?: string } | null)
      ?.participant_uuid ?? null,
  )
  const bot_participant_uuid = clean_uuid(
    (bot_result.data as { participant_uuid?: string } | null)
      ?.participant_uuid ?? null,
  )
  const customer_user_uuid = clean_uuid(
    (user_result.data as { user_uuid?: string } | null)?.user_uuid ?? null,
  )
  const admin_participant_uuid = clean_uuid(
    (admin_participant_pick.data as { participant_uuid?: string } | null)
      ?.participant_uuid ?? null,
  )

  if (!user_participant_uuid || !bot_participant_uuid) {
    return {
      status: 400,
      body: { ok: false, error: 'invalid_room' },
    }
  }

  const display_name = await resolve_handoff_memo_saved_by_name(
    session.user_uuid,
  )
  const text = `${display_name} が対応を始めました`
  const bundle = build_room_action_log_bundle({
    text,
    locale: 'ja',
    actor_display_name: display_name,
    admin_user_uuid: admin_uuid,
  })

  await emit_chat_realtime_support_debug({
    event: 'chat_support_started_insert_started',
    room_uuid,
    participant_uuid: user_participant_uuid,
    user_uuid: admin_uuid,
    role: session.role,
    tier: session.tier,
    source_channel: 'web',
    payload_action_uuid: bundle.bundle_uuid,
    phase: 'archive_support_started_action',
  })

  let archived_support_messages: archived_message[]

  try {
    archived_support_messages = await archive_message_bundles({
      room_uuid,
      participant_uuid: user_participant_uuid,
      bot_participant_uuid,
      channel: 'web',
      bundles: [bundle],
    })
  } catch (error) {
    await emit_chat_realtime_support_debug({
      event: 'chat_support_started_insert_failed',
      room_uuid,
      participant_uuid: user_participant_uuid,
      user_uuid: admin_uuid,
      role: session.role,
      tier: session.tier,
      source_channel: 'web',
      payload_action_uuid: bundle.bundle_uuid,
      phase: 'archive_support_started_action',
      error,
    })

    return {
      status: 500,
      body: { ok: false, error: 'support_started_insert_failed' },
    }
  }

  await emit_chat_realtime_support_debug({
    event: 'chat_support_started_insert_succeeded',
    room_uuid,
    participant_uuid: user_participant_uuid,
    user_uuid: admin_uuid,
    role: session.role,
    tier: session.tier,
    source_channel: 'web',
    payload_message_uuid:
      archived_support_messages[0]?.archive_uuid ?? null,
    payload_action_uuid: bundle.bundle_uuid,
    phase: 'archive_support_started_action',
  })

  const room_pick = await supabase
    .from('rooms')
    .select('action_id')
    .eq('room_uuid', room_uuid)
    .maybeSingle()

  if (room_pick.error) {
    console.error('[admin_reception_open] room_action_load_failed', {
      room_uuid,
      error: room_pick.error,
    })
  }

  const action_id_raw =
    typeof room_pick.data?.action_id === 'string'
      ? room_pick.data.action_id.trim()
      : ''

  const discord_thread_action_id = normalize_discord_thread_action_id(
    room_pick.data?.action_id ?? null,
  )

  if (
    discord_thread_action_id &&
    action_id_raw &&
    discord_thread_action_id !== action_id_raw
  ) {
    const repair = await supabase
      .from('rooms')
      .update({
        action_id: discord_thread_action_id,
        updated_at: new Date().toISOString(),
      })
      .eq('room_uuid', room_uuid)

    if (repair.error) {
      console.warn(
        '[admin_reception_open] room_action_id_normalize_save_failed',
        {
          room_uuid,
          error: repair.error,
        },
      )
    }
  }

  const subject = await resolve_room_subject(room_uuid)
  const customer_display_name = subject.display_name

  const admin_profile_json = await fetch_user_profile_json(admin_uuid)
  const admin_internal_name_raw =
    admin_profile_json.internal_name?.trim() ?? ''
  const admin_internal_name =
    admin_internal_name_raw.length > 0 ? admin_internal_name_raw : null

  const support_started_debug_participants = {
    actions_table: public_actions_table_name(),
    admin_user_uuid: admin_uuid,
    admin_participant_uuid,
    admin_internal_name,
    customer_user_uuid,
    customer_participant_uuid: user_participant_uuid,
    discord_id_exists: Boolean(discord_thread_action_id),
    discord_id: mask_discord_action_id_for_log(
      discord_thread_action_id ?? action_id_raw,
    ),
    insert_payload_keys: [] as string[],
    notification_route: null,
    error_code: null,
    error_message: null,
    phase: 'actions_table_insert',
  }

  await debug_event({
    category: 'admin_chat',
    event: 'support_started_action_create_started',
    payload: {
      room_uuid,
      action_uuid: null,
      ...support_started_debug_participants,
      insert_payload_keys: [
        'action_type',
        'actor_display_name',
        'actor_participant_uuid',
        'actor_role',
        'actor_user_uuid',
        'body',
        'created_at',
        'room_uuid',
        'source_channel',
        'visibility',
      ],
    },
  })

  const inserted = await insert_support_started_action(supabase, {
    room_uuid,
    admin_user_uuid: admin_uuid,
    admin_participant_uuid,
    customer_user_uuid,
    customer_participant_uuid: user_participant_uuid,
    discord_id: discord_thread_action_id,
    body: text,
    customer_display_name: customer_display_name.slice(0, 500),
    admin_internal_name,
    admin_display_label: display_name,
  })

  if (!inserted.ok) {
    const err = inserted.error
    const err_code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code ?? '')
        : ''
    const err_message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message ?? err)
          : String(err)

    console.error('[admin_reception_open] actions_insert_failed', {
      actions_table: public_actions_table_name(),
      room_uuid,
      error: inserted.error,
    })

    await debug_event({
      category: 'admin_chat',
      event: 'support_started_action_create_failed',
      payload: {
        room_uuid,
        action_uuid: null,
        ...support_started_debug_participants,
        error_code: err_code.length > 0 ? err_code : null,
        error_message: err_message,
      },
    })
  } else {
    const action_uuid = inserted.action_row_id
    const created_at = inserted.created_at

    await debug_event({
      category: 'admin_chat',
      event: 'support_started_action_create_succeeded',
      payload: {
        room_uuid,
        action_uuid,
        ...support_started_debug_participants,
        insert_payload_keys: inserted.insert_payload_keys,
      },
    })

    const notify_out = await notify({
      event: 'support_started',
      room_uuid,
      action_uuid,
      created_at,
      admin_display_label: display_name,
      customer_display_name,
      admin_internal_name,
      admin_user_uuid: admin_uuid,
      admin_participant_uuid,
      customer_user_uuid,
      customer_participant_uuid: user_participant_uuid,
      discord_thread_action_id,
      source_channel: 'web',
      started_at: created_at,
    })

    const merge_meta = await merge_support_started_notify_meta_into_chat_action(
      supabase,
      {
        action_uuid,
        notify_meta:
          notify_out.support_started_meta ?? {
            outcome: 'skipped',
            error_message: 'missing_support_started_meta',
          },
      },
    )

    if (!merge_meta.ok) {
      console.error('[admin_reception_open] support_started_meta_merge_failed', {
        room_uuid,
        action_uuid,
        error: merge_meta.error,
      })
    }
  }

  return {
    status: 200,
    body: { ok: true },
  }
}

export async function handle_chat_message_request(
  request: Request,
): Promise<{ status: number; body: chat_message_request_result }> {
  const body = (await request.json().catch(() => null)) as {
    room_uuid?: string
    participant_uuid?: string
    locale?: string
    text?: string
    source?: string
  } | null

  const text_value = typeof body?.text === 'string' ? body.text.trim() : ''

  if (body?.source === 'admin_reception') {
    const room_uuid = clean_uuid(body.room_uuid)
    const body_length = text_value.length

    await emit_chat_message_send_debug({
      event: 'chat_message_send_started',
      room_uuid,
      source_channel: 'web',
      body_length,
      phase: 'admin_reception_request_received',
    })

    if (typeof body.room_uuid !== 'string' || text_value.length === 0) {
      await emit_chat_message_send_debug({
        event: 'chat_message_send_blocked',
        room_uuid,
        source_channel: 'web',
        body_length,
        phase: 'validate_admin_reception_message',
        error_code: !room_uuid ? 'missing_room_uuid' : 'empty_body',
        error_message: 'invalid_message',
        error_hint: 'check_room_uuid_and_non_empty_text',
      })

      return {
        status: 400,
        body: { ok: false, error: 'invalid_message' },
      }
    }

    const session = await get_session_user()
    const base_debug = {
      room_uuid,
      sender_user_uuid: session.user_uuid,
      source_channel: 'web' as const,
      body_length,
    }

    if (session.role !== 'admin') {
      await emit_chat_message_send_debug({
        event: 'chat_message_send_blocked',
        ...base_debug,
        sender_role: session.role,
        phase: 'authorize_admin_reception_message',
        error_code: 'forbidden',
        error_message: 'admin role required',
        error_hint: 'check_admin_session_role',
      })

      return {
        status: 403,
        body: { ok: false, error: 'forbidden' },
      }
    }

    if (!session.user_uuid) {
      await emit_chat_message_send_debug({
        event: 'chat_message_send_blocked',
        ...base_debug,
        sender_role: session.role,
        phase: 'resolve_admin_session_user',
        error_code: 'session_required',
        error_message: 'sender_user_uuid missing',
        error_hint: 'check_admin_session',
      })

      return {
        status: 401,
        body: { ok: false, error: 'session_required' },
      }
    }

    let resolved: Awaited<
      ReturnType<typeof resolve_admin_reception_send_context>
    >

    try {
      resolved = await resolve_admin_reception_send_context({
        room_uuid: body.room_uuid,
        staff_user_uuid: session.user_uuid,
      })
    } catch (error) {
      await emit_chat_message_send_debug({
        event: 'chat_message_send_failed',
        ...base_debug,
        sender_role: session.role,
        phase: 'resolve_admin_reception_send_context',
        error,
        error_hint: 'check_room_participants_and_rls',
      })

      return {
        status: 500,
        body: {
          ok: false,
          error: 'message_send_failed',
          reason: 'resolve_send_context_failed',
        },
      }
    }

    if (!resolved.ok) {
      await emit_chat_message_send_debug({
        event: 'chat_message_send_blocked',
        ...base_debug,
        sender_role: session.role,
        phase: 'resolve_admin_reception_send_context',
        error_code: resolved.error,
        error_message: resolved.error,
        error_hint: 'check_room_uuid_and_required_participants',
        extra: {
          participant_found: false,
        },
      })

      if (resolved.error === 'room_not_found') {
        return {
          status: 404,
          body: { ok: false, error: 'room_not_found' },
        }
      }

      if (resolved.error === 'staff_missing') {
        return {
          status: 403,
          body: {
            ok: false,
            error: 'admin_send_not_allowed',
            reason: resolved.error,
          },
        }
      }

      return {
        status: 400,
        body: { ok: false, error: 'invalid_room' },
      }
    }

    const locale = normalize_locale(body.locale) as chat_locale
    const sender_display_name = await resolve_handoff_memo_saved_by_name(
      session.user_uuid,
    )
    const incoming_bundle = build_staff_text_bundle({
      text: text_value,
      locale,
      sender: resolved.data.staff_sender_role,
      sender_display_name,
    })
    let archived_messages: archived_message[]

    try {
      archived_messages = await archive_message_bundles({
        room_uuid: resolved.data.room_uuid,
        participant_uuid: resolved.data.user_participant_uuid,
        bot_participant_uuid: resolved.data.bot_participant_uuid,
        staff_participant_uuid: resolved.data.staff_participant_uuid,
        channel: 'web',
        bundles: [incoming_bundle],
      })
    } catch (error) {
      await emit_chat_message_send_debug({
        event: 'chat_message_send_failed',
        ...base_debug,
        sender_participant_uuid: resolved.data.staff_participant_uuid,
        sender_role: resolved.data.staff_sender_role,
        phase: 'archive_admin_reception_message',
        error,
        error_hint: 'check_messages_insert_payload_rls_and_constraints',
        extra: {
          user_participant_uuid: resolved.data.user_participant_uuid,
          bot_participant_uuid: resolved.data.bot_participant_uuid,
          participant_found: Boolean(resolved.data.staff_participant_uuid),
        },
      })

      return {
        status: 500,
        body: {
          ok: false,
          error: 'message_send_failed',
          reason: 'archive_insert_failed',
        },
      }
    }

    await emit_chat_message_send_debug({
      event: 'chat_message_send_succeeded',
      ...base_debug,
      sender_participant_uuid: resolved.data.staff_participant_uuid,
      sender_role: resolved.data.staff_sender_role,
      phase: 'archive_admin_reception_message',
      extra: {
        message_count: archived_messages.length,
        participant_found: Boolean(resolved.data.staff_participant_uuid),
      },
    })

    return {
      status: 200,
      body: {
        ok: true,
        kind: 'plain_text',
        messages: archived_messages,
      },
    }
  }

  const visitor_uuid = await get_request_visitor_uuid()
  const session = await get_session_user()
  const room_uuid_in = clean_uuid(body?.room_uuid)
  const participant_uuid_in = clean_uuid(body?.participant_uuid)

  const user_message_diag = (
    phase: string,
    extra: Record<string, unknown> = {},
  ) => ({
    room_uuid: room_uuid_in,
    participant_uuid: participant_uuid_in,
    user_uuid: clean_uuid(session.user_uuid),
    visitor_uuid,
    role: session.role ?? null,
    tier: session.tier ?? null,
    source_channel: 'web',
    message_body_exists: text_value.length > 0,
    message_body_length: text_value.length,
    insert_table: null as string | null,
    message_uuid: null as string | null,
    error_code: null as string | null,
    error_message: null as string | null,
    error_details: null as string | null,
    error_hint: null as string | null,
    phase,
    ...extra,
  })

  await emit_message_send_diagnostic_pair({
    chat_event: 'chat_message_send_started',
    user_event: 'user_message_send_started',
    payload: user_message_diag('api_user_message_enter'),
  })

  await emit_message_send_diagnostic_pair({
    chat_event: 'chat_message_session_loaded',
    user_event: 'user_message_session_checked',
    payload: user_message_diag('session_read'),
  })

  if (!visitor_uuid) {
    await emit_message_send_diagnostic_pair({
      chat_event: 'chat_message_send_blocked',
      user_event: 'user_message_send_blocked',
      payload: {
        ...user_message_diag('missing_visitor_uuid'),
        error_code: 'missing_visitor_uuid',
        error_message: 'missing_visitor_uuid',
      },
    })

    return {
      status: 401,
      body: { ok: false, error: 'session_required' },
    }
  }

  if (!body?.room_uuid || !body.participant_uuid || text_value.length === 0) {
    await emit_message_send_diagnostic_pair({
      chat_event: 'chat_message_send_blocked',
      user_event: 'user_message_send_blocked',
      payload: {
        ...user_message_diag('invalid_body'),
        error_code: 'invalid_message',
        error_message: 'room_participant_or_text_missing',
      },
    })

    return {
      status: 400,
      body: { ok: false, error: 'invalid_message' },
    }
  }

  if (!room_uuid_in || !participant_uuid_in) {
    await emit_message_send_diagnostic_pair({
      chat_event: 'chat_message_send_blocked',
      user_event: 'user_message_send_blocked',
      payload: {
        ...user_message_diag('invalid_uuids'),
        error_code: 'invalid_uuid',
        error_message: 'room_or_participant_uuid_invalid',
      },
    })

    return {
      status: 400,
      body: { ok: false, error: 'invalid_message' },
    }
  }

  const sender_user_uuid = clean_uuid(session.user_uuid)
  const requires_authenticated_sender =
    session.tier === 'member' ||
    session.tier === 'vip' ||
    (session.role === 'user' && session.tier !== 'guest')

  if (requires_authenticated_sender && !sender_user_uuid) {
    await emit_message_send_diagnostic_pair({
      chat_event: 'chat_message_send_blocked',
      user_event: 'user_message_send_blocked',
      payload: {
        ...user_message_diag('member_missing_user_uuid'),
        error_code: 'session_required',
        error_message: 'user_uuid_required_for_member_send',
      },
    })

    return {
      status: 401,
      body: { ok: false, error: 'session_required' },
    }
  }

  const locale = normalize_locale(body.locale) as chat_locale
  const web_bot_decision = decide_bot_action({
    text: text_value,
    locale,
    current_mode: 'bot',
    source_channel: 'web',
  })
  const detected_switch_mode =
    web_bot_decision.action === 'switch_mode'
      ? web_bot_decision.mode ?? null
      : null

  if (detected_switch_mode === 'concierge') {
    const eligibility = await current_session_concierge_eligibility()

    if (!eligibility.allowed) {
      return {
        status: 403,
        body: {
          ok: false,
          error: 'link_required',
          reason: 'concierge_requires_member',
        },
      }
    }
  }

  const initial_mode: room_mode = detected_switch_mode ?? 'bot'

  const room_resolved = await resolve_web_chat_room_for_request({
    visitor_uuid,
    room_uuid: body.room_uuid,
    participant_uuid: body.participant_uuid,
    mode: initial_mode,
  })

  if (!room_resolved.ok) {
    await emit_message_send_diagnostic_pair({
      chat_event: 'chat_message_send_failed',
      user_event: 'user_message_send_failed',
      payload: {
        ...user_message_diag('web_room_resolve_failed'),
        error_code: 'room_resolve_failed',
        error_message: 'resolve_web_chat_room_for_request_not_ok',
      },
    })

    return room_resolved.response
  }

  const chat_room = room_resolved.chat_room

  await emit_message_send_diagnostic_pair({
    chat_event: 'chat_message_room_checked',
    user_event: 'user_message_room_checked',
    payload: {
      room_uuid: chat_room.room_uuid,
      participant_uuid: chat_room.participant_uuid,
      user_uuid: clean_uuid(session.user_uuid),
      visitor_uuid,
      role: session.role ?? null,
      tier: session.tier ?? null,
      source_channel: chat_room.channel,
      message_body_exists: text_value.length > 0,
      message_body_length: text_value.length,
      insert_table: null,
      message_uuid: null,
      error_code: null,
      error_message: null,
      error_details: null,
      error_hint: null,
      phase: 'web_room_resolve_succeeded',
    },
  })

  await emit_message_send_diagnostic_pair({
    chat_event: 'chat_message_participant_checked',
    user_event: 'user_message_participant_checked',
    payload: {
      room_uuid: chat_room.room_uuid,
      participant_uuid: chat_room.participant_uuid,
      user_uuid: clean_uuid(session.user_uuid),
      visitor_uuid,
      role: session.role ?? null,
      tier: session.tier ?? null,
      source_channel: chat_room.channel,
      message_body_exists: text_value.length > 0,
      message_body_length: text_value.length,
      insert_table: null,
      message_uuid: null,
      error_code: null,
      error_message: null,
      error_details: null,
      error_hint: null,
      phase: 'participant_ready_for_archive',
    },
  })

  if (detected_switch_mode) {
    const incoming_bundle = build_line_mode_switch_bundle({
      text: text_value,
      mode: detected_switch_mode,
      locale,
    })

    const switch_result = await execute_room_mode_switch({
      room: { ...chat_room, mode: detected_switch_mode },
      locale,
      incoming_bundle,
    })

    if (!switch_result.ok) {
      return {
        status: switch_result.error === 'link_required' ? 403 : 400,
        body: {
          ok: false,
          error: switch_result.error,
          reason: switch_result.reason,
        },
      }
    }

    return {
      status: 200,
      body: {
        ok: true,
        kind: 'switch_mode',
        mode: switch_result.mode,
        messages: switch_result.messages,
      },
    }
  }

  const incoming_bundle = build_user_text_bundle({
    text: text_value,
    locale,
  })

  await emit_message_send_diagnostic_pair({
    chat_event: 'chat_message_payload_built',
    user_event: 'user_message_payload_built',
    payload: {
      room_uuid: chat_room.room_uuid,
      participant_uuid: chat_room.participant_uuid,
      user_uuid: clean_uuid(session.user_uuid),
      visitor_uuid,
      role: session.role ?? null,
      tier: session.tier ?? null,
      source_channel: chat_room.channel,
      message_body_exists: text_value.length > 0,
      message_body_length: text_value.length,
      insert_table: 'public.messages',
      message_uuid: null,
      error_code: null,
      error_message: null,
      error_details: null,
      error_hint: null,
      phase: 'user_text_bundle_ready',
    },
  })

  await emit_message_send_diagnostic_pair({
    chat_event: 'chat_message_archive_started',
    user_event: 'user_message_archive_started',
    payload: {
      room_uuid: chat_room.room_uuid,
      participant_uuid: chat_room.participant_uuid,
      user_uuid: clean_uuid(session.user_uuid),
      visitor_uuid,
      role: session.role ?? null,
      tier: session.tier ?? null,
      source_channel: chat_room.channel,
      message_body_exists: text_value.length > 0,
      message_body_length: text_value.length,
      insert_table: 'public.messages',
      message_uuid: null,
      error_code: null,
      error_message: null,
      error_details: null,
      error_hint: null,
      phase: 'before_archive_message_bundles',
    },
  })

  let archived_messages: archived_message[]

  try {
    archived_messages = await archive_message_bundles({
      room_uuid: chat_room.room_uuid,
      participant_uuid: chat_room.participant_uuid,
      bot_participant_uuid: chat_room.bot_participant_uuid,
      channel: chat_room.channel,
      bundles: [incoming_bundle],
    })
  } catch (error) {
    const err_fields = chat_message_error_fields(error)

    await emit_message_send_diagnostic_pair({
      chat_event: 'chat_message_archive_failed',
      user_event: 'user_message_archive_failed',
      payload: {
        room_uuid: chat_room.room_uuid,
        participant_uuid: chat_room.participant_uuid,
        user_uuid: clean_uuid(session.user_uuid),
        visitor_uuid,
        role: session.role ?? null,
        tier: session.tier ?? null,
        source_channel: chat_room.channel,
        message_body_exists: text_value.length > 0,
        message_body_length: text_value.length,
        insert_table: 'public.messages',
        message_uuid: null,
        ...err_fields,
        phase: 'archive_message_bundles_exception',
      },
    })

    await emit_message_send_diagnostic_pair({
      chat_event: 'chat_message_send_failed',
      user_event: 'user_message_send_failed',
      payload: {
        room_uuid: chat_room.room_uuid,
        participant_uuid: chat_room.participant_uuid,
        user_uuid: clean_uuid(session.user_uuid),
        visitor_uuid,
        role: session.role ?? null,
        tier: session.tier ?? null,
        source_channel: chat_room.channel,
        message_body_exists: text_value.length > 0,
        message_body_length: text_value.length,
        insert_table: 'public.messages',
        message_uuid: null,
        ...err_fields,
        phase: 'user_plain_text_send_failed',
      },
    })

    return {
      status: 500,
      body: {
        ok: false,
        error: 'message_send_failed',
        reason: 'archive_failed',
      },
    }
  }

  await emit_message_send_diagnostic_pair({
    chat_event: 'chat_message_archive_succeeded',
    user_event: 'user_message_archive_succeeded',
    payload: {
      room_uuid: chat_room.room_uuid,
      participant_uuid: chat_room.participant_uuid,
      user_uuid: clean_uuid(session.user_uuid),
      visitor_uuid,
      role: session.role ?? null,
      tier: session.tier ?? null,
      source_channel: chat_room.channel,
      message_body_exists: text_value.length > 0,
      message_body_length: text_value.length,
      insert_table: 'public.messages',
      message_uuid: archived_messages[0]?.archive_uuid ?? null,
      error_code: null,
      error_message: null,
      error_details: null,
      error_hint: null,
      phase: 'archive_message_bundles_ok',
    },
  })

  await emit_message_send_diagnostic_pair({
    chat_event: 'chat_message_send_finished',
    user_event: 'user_message_send_finished',
    payload: {
      room_uuid: chat_room.room_uuid,
      participant_uuid: chat_room.participant_uuid,
      user_uuid: clean_uuid(session.user_uuid),
      visitor_uuid,
      role: session.role ?? null,
      tier: session.tier ?? null,
      source_channel: chat_room.channel,
      message_body_exists: text_value.length > 0,
      message_body_length: text_value.length,
      insert_table: 'public.messages',
      message_uuid: archived_messages[0]?.archive_uuid ?? null,
      error_code: null,
      error_message: null,
      error_details: null,
      error_hint: null,
      phase: 'user_plain_text_send_ok',
    },
  })

  return {
    status: 200,
    body: {
      ok: true,
      kind: 'plain_text',
      messages: archived_messages,
    },
  }
}
