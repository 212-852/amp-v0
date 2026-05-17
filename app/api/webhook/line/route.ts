import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import { resolve_initial_chat } from '@/lib/chat/action'
import { clean_uuid } from '@/lib/db/uuid/payload'
import {
  resolve_dispatch_locale,
  resolve_line_dispatch_identity,
} from '@/lib/dispatch/context'
import { fetch_line_messaging_profile } from '@/lib/line/messaging/profile'
import {
  line_webhook_debug,
  line_webhook_event_skipped,
  line_webhook_fallback_returned,
  line_webhook_phase_failed,
  line_webhook_phase_started,
  line_webhook_phase_succeeded,
  line_user_resolve_soft_failed,
  serialize_line_webhook_error,
  type line_webhook_context,
} from '@/lib/line/webhook/debug'
import { notify_new_user_created } from '@/lib/notify/user/created'
import { try_deliver_line_webhook_recruitment_reply } from '@/lib/recruitment/action'

type line_webhook_event = {
  type?: string
  replyToken?: string
  webhookEventId?: string
  deliveryContext?: {
    isRedelivery?: boolean
  }
  source?: {
    type?: string
    userId?: string
    groupId?: string
    roomId?: string
    locale?: string
    language?: string
  }
  message?: {
    type?: string
    id?: string
    text?: string
  }
  timestamp?: number
}

type line_webhook_body = {
  destination?: string
  events?: line_webhook_event[]
}

const processed_line_event_keys = new Set<string>()

function verify_line_signature(body: string, signature: string | null) {
  const channel_secret = process.env.LINE_MESSAGING_CHANNEL_SECRET

  if (!channel_secret || !signature) {
    return {
      ok: false,
      reason: !channel_secret
        ? 'missing_line_messaging_channel_secret'
        : 'missing_x_line_signature',
    }
  }

  const hash = createHmac('sha256', channel_secret)
    .update(body)
    .digest('base64')

  if (hash !== signature) {
    return { ok: false, reason: 'invalid_signature' }
  }

  return { ok: true, reason: null }
}

function get_allowed_user_ids() {
  return (
    process.env.LINE_REPLY_ALLOWED_USER_IDS
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean) ?? []
  )
}

function is_allowed_line_user(line_user_id?: string) {
  if (process.env.LINE_REPLY_TEST_MODE !== 'true') {
    return true
  }

  if (!line_user_id) {
    return false
  }

  return get_allowed_user_ids().includes(line_user_id)
}

function get_line_event_key(event: line_webhook_event) {
  if (event.message?.id) {
    return event.message.id
  }

  if (event.replyToken) {
    return event.replyToken
  }

  return [
    event.timestamp ?? 'no_timestamp',
    event.source?.userId ?? 'no_user',
    event.type ?? 'no_type',
  ].join(':')
}

function event_context(event: line_webhook_event): line_webhook_context {
  return {
    line_user_id: event.source?.userId ?? null,
    reply_token: event.replyToken ?? null,
    message_text:
      typeof event.message?.text === 'string' ? event.message.text : null,
    message_id: event.message?.id ?? null,
    event_type: event.type ?? null,
  }
}

function summarize_events(events: line_webhook_event[]) {
  return {
    event_count: events.length,
    event_types: events.map((event) => event.type ?? null),
    message_types: events.map((event) => event.message?.type ?? null),
    has_reply_tokens: events.map((event) => Boolean(event.replyToken)),
    user_ids_exist: events.map((event) => Boolean(event.source?.userId)),
  }
}

async function try_recruitment_reply_first(input: {
  event: line_webhook_event
  context: line_webhook_context
  line_user_id: string
}): Promise<boolean> {
  const message_text = input.event.message?.text

  if (typeof message_text !== 'string' || !input.event.replyToken?.trim()) {
    return false
  }

  await line_webhook_phase_started('intent_check', input.context)

  try {
    const handled = await try_deliver_line_webhook_recruitment_reply({
      text: message_text,
      locale: 'ja',
      line_reply_token: input.event.replyToken,
      line_user_id: input.line_user_id,
    })

    if (handled) {
      await line_webhook_phase_succeeded('output_line_send', input.context, {
        standalone: true,
        recruitment_only: true,
      })
    } else {
      await line_webhook_phase_succeeded('intent_check', input.context, {
        recruitment_matched: false,
      })
    }

    return handled
  } catch (error) {
    await line_webhook_phase_failed('recruitment_bundle_build', {
      reason: 'standalone_recruitment_reply_failed',
      error,
      context: input.context,
    })

    return false
  }
}

async function try_resolve_line_session_context(input: {
  event: line_webhook_event
  line_user_id: string
  base_context: line_webhook_context
}): Promise<{
  auth_resolved: boolean
  context: line_webhook_context
  dispatch_context: Awaited<
    ReturnType<typeof resolve_line_dispatch_identity>
  > | null
  stored_user_locale?: string | null
}> {
  const anonymous_context: line_webhook_context = {
    ...input.base_context,
    user_uuid: null,
    visitor_uuid: null,
    room_uuid: null,
    participant_uuid: null,
  }

  await line_webhook_phase_started('line_user_resolve', input.base_context)

  let dispatch_context: Awaited<
    ReturnType<typeof resolve_line_dispatch_identity>
  > | null = null

  try {
    dispatch_context = await resolve_line_dispatch_identity({
      line_user_id: input.line_user_id,
    })
  } catch (dispatch_error) {
    await line_user_resolve_soft_failed({
      context: anonymous_context,
      reason: 'resolve_line_dispatch_identity_failed',
      error: dispatch_error,
      auth_resolved: false,
      fallback_mode: 'anonymous_line_context',
      continue_reply_flow: true,
    })

    return {
      auth_resolved: false,
      context: anonymous_context,
      dispatch_context: null,
      stored_user_locale: null,
    }
  }

  if (dispatch_context.user_uuid) {
    const resolved_context: line_webhook_context = {
      ...input.base_context,
      room_uuid:
        dispatch_context.room_result?.ok === true
          ? dispatch_context.room_result.room.room_uuid
          : null,
      participant_uuid:
        dispatch_context.room_result?.ok === true
          ? dispatch_context.room_result.room.participant_uuid
          : null,
      user_uuid: dispatch_context.user_uuid,
      visitor_uuid:
        dispatch_context.visitor_uuid ??
        (dispatch_context.room_result?.ok === true
          ? dispatch_context.room_result.room.visitor_uuid
          : null),
    }

    await line_webhook_phase_succeeded('line_user_resolve', resolved_context, {
      auth_resolved: true,
    })

    return {
      auth_resolved: true,
      context: resolved_context,
      dispatch_context,
      stored_user_locale: null,
    }
  }

  const msg_profile = await fetch_line_messaging_profile(input.line_user_id)
  const profile_locale = await resolve_dispatch_locale({
    source_channel: 'line',
    line_user_id: input.line_user_id,
    line_profile_locale: msg_profile?.language ?? null,
    webhook_source_locale:
      input.event.source?.locale ?? input.event.source?.language ?? null,
  })
  const line_display_name = msg_profile?.displayName?.trim() || null
  const line_image_url = msg_profile?.pictureUrl?.trim() || null

  try {
    const access = await resolve_auth_access({
      provider: 'line',
      provider_id: input.line_user_id,
      locale: profile_locale.locale,
      display_name: line_display_name,
      image_url: line_image_url,
    })

    const access_context: line_webhook_context = {
      ...anonymous_context,
      user_uuid: access.user_uuid,
      visitor_uuid: access.visitor_uuid,
      room_uuid:
        dispatch_context.room_result?.ok === true
          ? dispatch_context.room_result.room.room_uuid
          : null,
      participant_uuid:
        dispatch_context.room_result?.ok === true
          ? dispatch_context.room_result.room.participant_uuid
          : null,
    }

    await line_webhook_phase_succeeded('line_user_resolve', access_context, {
      auth_resolved: true,
      created_user: access.is_new_user,
    })

    if (access.is_new_user) {
      try {
        await notify_new_user_created({
          provider: 'line',
          user_uuid: access.user_uuid,
          visitor_uuid: access.visitor_uuid,
          display_name: line_display_name,
          locale: access.locale,
          is_new_user: access.is_new_user,
          is_new_visitor: access.is_new_visitor,
        })
      } catch (notify_error) {
        await line_webhook_phase_failed('line_user_resolve', {
          reason: 'new_user_notify_failed',
          error: notify_error,
          context: access_context,
        })
      }
    }

    return {
      auth_resolved: true,
      context: access_context,
      dispatch_context,
      stored_user_locale: access.locale,
    }
  } catch (identity_error) {
    await line_user_resolve_soft_failed({
      context: anonymous_context,
      reason: 'resolve_auth_access_failed',
      error: identity_error,
      auth_resolved: false,
      fallback_mode: 'anonymous_line_context',
      continue_reply_flow: true,
    })

    return {
      auth_resolved: false,
      context: anonymous_context,
      dispatch_context,
      stored_user_locale: null,
    }
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get('x-line-signature')

  await line_webhook_debug('line_webhook_received', {
    method: request.method,
    url: request.url,
    headers_exist: true,
    x_line_signature_exists: Boolean(signature),
    body_length: null,
    timestamp: new Date().toISOString(),
  })

  let body_text = ''

  try {
    await line_webhook_phase_started('raw_body_read')
    body_text = await request.text()
    await line_webhook_phase_succeeded('raw_body_read', {}, {
      body_length: body_text.length,
    })
  } catch (error) {
    await line_webhook_phase_failed('raw_body_read', {
      reason: 'request_text_read_failed',
      error,
    })

    return NextResponse.json(
      { error: 'Failed to read body' },
      { status: 400 },
    )
  }

  await line_webhook_debug('line_webhook_received', {
    method: request.method,
    url: request.url,
    headers_exist: true,
    x_line_signature_exists: Boolean(signature),
    body_length: body_text.length,
    timestamp: new Date().toISOString(),
  })

  await line_webhook_phase_started('signature_verify')

  const signature_result = verify_line_signature(body_text, signature)

  if (!signature_result.ok) {
    await line_webhook_phase_failed('signature_verify', {
      reason: signature_result.reason ?? 'signature_verify_failed',
    })

    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 },
    )
  }

  await line_webhook_phase_succeeded('signature_verify')

  let body: line_webhook_body

  try {
    await line_webhook_phase_started('event_parse')
    body = JSON.parse(body_text) as line_webhook_body
    await line_webhook_phase_succeeded('event_parse', {}, {
      event_count: body.events?.length ?? 0,
    })
  } catch (error) {
    await line_webhook_phase_failed('event_parse', {
      reason: 'invalid_json',
      error,
    })

    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 },
    )
  }

  const events = body.events ?? []

  await line_webhook_debug('line_webhook_events_parsed', summarize_events(events))

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    const context = event_context(event)
    const line_user_id = event.source?.userId

    await line_webhook_debug('line_webhook_event_loop_started', {
      index,
      event_type: event.type ?? null,
      message_type: event.message?.type ?? null,
      line_user_id_exists: Boolean(line_user_id),
      reply_token_exists: Boolean(event.replyToken),
      message_text: context.message_text,
    })

    if (event.deliveryContext?.isRedelivery === true) {
      await line_webhook_event_skipped({
        reason: 'redelivery',
        context,
        extra: { index },
      })
      continue
    }

    if (event.type !== 'message') {
      await line_webhook_event_skipped({
        reason: 'unsupported_event_type',
        context,
        extra: { index, event_type: event.type ?? null },
      })
      continue
    }

    if (event.message?.type !== 'text') {
      await line_webhook_event_skipped({
        reason: 'unsupported_message_type',
        context,
        extra: { index, message_type: event.message?.type ?? null },
      })
      continue
    }

    if (!event.message.id || typeof event.message.text !== 'string') {
      await line_webhook_event_skipped({
        reason: 'empty_text',
        context,
        extra: { index },
      })
      continue
    }

    if (!event.replyToken?.trim()) {
      await line_webhook_event_skipped({
        reason: 'missing_reply_token',
        context,
        extra: { index },
      })
      continue
    }

    const event_key = get_line_event_key(event)

    if (processed_line_event_keys.has(event_key)) {
      await line_webhook_event_skipped({
        reason: 'duplicate_event',
        context,
        extra: { index, event_key },
      })
      continue
    }

    processed_line_event_keys.add(event_key)

    if (!is_allowed_line_user(line_user_id)) {
      await line_webhook_event_skipped({
        reason: 'test_mode_user_not_allowed',
        context,
        extra: {
          index,
          line_user_id,
          line_reply_test_mode: process.env.LINE_REPLY_TEST_MODE === 'true',
          allowed_user_ids_count: get_allowed_user_ids().length,
        },
      })
      continue
    }

    if (!line_user_id) {
      await line_webhook_event_skipped({
        reason: 'missing_line_user_id',
        context,
        extra: { index },
      })
      continue
    }

    try {
      const recruitment_handled = await try_recruitment_reply_first({
        event,
        context,
        line_user_id,
      })

      if (recruitment_handled) {
        continue
      }

      const incoming_line_text = {
        text: event.message.text,
        line_message_id: event.message.id,
        created_at: event.timestamp
          ? new Date(event.timestamp).toISOString()
          : new Date().toISOString(),
        webhook_event_id: event.webhookEventId ?? null,
        delivery_context_redelivery:
          event.deliveryContext?.isRedelivery ?? null,
      }

      const session = await try_resolve_line_session_context({
        event,
        line_user_id,
        base_context: context,
      })

      if (!session.auth_resolved || !session.context.user_uuid) {
        await line_webhook_event_skipped({
          reason: 'session_restore_skipped_anonymous',
          context: session.context,
          extra: { index },
        })
        continue
      }

      const chat_context = session.context

      await line_webhook_phase_started('room_resolve', chat_context)

      const resolved_locale = await resolve_dispatch_locale({
        source_channel: 'line',
        stored_user_locale: session.stored_user_locale ?? undefined,
        webhook_source_locale:
          event.source?.locale ?? event.source?.language ?? null,
        line_user_id,
      })

      await line_webhook_phase_started('recruitment_bundle_build', chat_context)

      try {
        await resolve_initial_chat({
          visitor_uuid:
            clean_uuid(chat_context.visitor_uuid) ??
            clean_uuid(session.dispatch_context?.visitor_uuid) ??
            clean_uuid(session.dispatch_context?.room_result?.room.visitor_uuid) ??
            null,
          user_uuid: clean_uuid(chat_context.user_uuid),
          channel: 'line',
          locale: resolved_locale.locale,
          line_reply_token: event.replyToken ?? null,
          line_user_id,
          incoming_line_text,
        })

        await line_webhook_phase_succeeded('output_line_send', chat_context)
        await line_webhook_phase_succeeded('room_resolve', chat_context)
      } catch (chat_error) {
        await line_webhook_phase_failed('recruitment_bundle_build', {
          reason: 'resolve_initial_chat_failed',
          error: chat_error,
          context: chat_context,
        })

        throw chat_error
      }
    } catch (error) {
      const serialized = serialize_line_webhook_error(error)

      console.error('[line_webhook_handler_failed]', {
        line_user_id: line_user_id ?? null,
        event_type: event.type ?? null,
        message_id: event.message?.id ?? null,
        ...serialized,
      })

      await line_webhook_fallback_returned({
        phase: 'event_handler',
        reason: 'event_handler_exception',
        error,
        context,
        extra: serialized,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
