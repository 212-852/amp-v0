import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import { resolve_initial_chat } from '@/lib/chat/action'
import { debug_event } from '@/lib/debug'
import { clean_uuid } from '@/lib/db/uuid/payload'
import {
  resolve_dispatch_locale,
  resolve_line_dispatch_identity,
} from '@/lib/dispatch/context'
import { normalize_recruitment_text } from '@/lib/recruitment/rules'
import { fetch_line_messaging_profile } from '@/lib/line/messaging/profile'
import { notify_new_user_created } from '@/lib/notify/user/created'
import { deliver_line_text_reply } from '@/lib/output/line'

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
    return false
  }

  const hash = createHmac('sha256', channel_secret)
    .update(body)
    .digest('base64')

  return hash === signature
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

function serialize_error(error: unknown) {
  return {
    name: error instanceof Error ? error.name : null,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    error,
  }
}

async function reply_line_webhook_error(input: {
  reply_token?: string | null
}) {
  try {
    await deliver_line_text_reply({
      reply_token: input.reply_token,
      text: 'LINE chat is temporarily unavailable. Please try again later.',
    })
  } catch (reply_error) {
    console.error('[line_reply_failed]', {
      error: serialize_error(reply_error),
    })
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get('x-line-signature')
  const body_text = await request.text()

  if (!verify_line_signature(body_text, signature)) {
    console.error('[line_webhook_signature_failed]', {
      ok: false,
      error: signature ? 'invalid_signature' : 'missing_signature',
    })

    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 },
    )
  }

  let body: line_webhook_body

  try {
    body = JSON.parse(body_text) as line_webhook_body
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 },
    )
  }

  const events = body.events ?? []

  for (const event of events) {
    const line_user_id = event.source?.userId

    if (event.deliveryContext?.isRedelivery === true) {
      continue
    }

    if (event.type !== 'message') {
      continue
    }

    if (event.message?.type !== 'text') {
      continue
    }

    if (!event.message.id || typeof event.message.text !== 'string') {
      continue
    }

    const event_key = get_line_event_key(event)

    if (processed_line_event_keys.has(event_key)) {
      continue
    }

    processed_line_event_keys.add(event_key)

    try {
      if (!is_allowed_line_user(line_user_id)) {
        continue
      }

      if (!line_user_id) {
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

      try {
        await debug_event({
          category: 'pwa',
          event: 'line_message_received',
          payload: {
            room_uuid: null,
            participant_uuid: null,
            user_uuid: null,
            line_user_id_exists: Boolean(line_user_id),
            message_uuid: event.message.id,
            source_channel: 'line',
            error_code: null,
            error_message: null,
          },
        })
      } catch {
        /* observability only */
      }

      const dispatch_context = await resolve_line_dispatch_identity({
        line_user_id,
      })

      try {
        await debug_event({
          category: 'recruitment',
          event: 'line_message_context_checked',
          payload: {
            source_channel: 'line',
            line_user_id_exists: Boolean(line_user_id),
            room_uuid:
              dispatch_context.room_result?.ok === true
                ? dispatch_context.room_result.room.room_uuid
                : null,
            participant_uuid:
              dispatch_context.room_result?.ok === true
                ? dispatch_context.room_result.room.participant_uuid
                : null,
            user_uuid: dispatch_context.user_uuid,
            message_text: event.message.text,
            normalized_text: normalize_recruitment_text(event.message.text),
          },
        })
      } catch {
        /* observability only */
      }

      if (dispatch_context.user_uuid) {
        const resolved_locale = await resolve_dispatch_locale({
          source_channel: 'line',
          webhook_source_locale:
            event.source?.locale ?? event.source?.language ?? null,
          line_user_id,
        })

        await resolve_initial_chat({
          visitor_uuid:
            clean_uuid(dispatch_context.visitor_uuid) ??
            clean_uuid(dispatch_context.room_result?.room.visitor_uuid) ??
            null,
          user_uuid: clean_uuid(dispatch_context.user_uuid),
          channel: 'line',
          locale: resolved_locale.locale,
          line_reply_token: event.replyToken ?? null,
          line_user_id,
          incoming_line_text,
        })

        continue
      }

      const msg_profile = await fetch_line_messaging_profile(line_user_id)
      const profile_locale = await resolve_dispatch_locale({
        source_channel: 'line',
        line_user_id,
        line_profile_locale: msg_profile?.language ?? null,
        webhook_source_locale:
          event.source?.locale ?? event.source?.language ?? null,
      })
      const line_display_name = msg_profile?.displayName?.trim() || null
      const line_image_url = msg_profile?.pictureUrl?.trim() || null
      let access: Awaited<ReturnType<typeof resolve_auth_access>>

      try {
        access = await resolve_auth_access({
          provider: 'line',
          provider_id: line_user_id,
          locale: profile_locale.locale,
          display_name: line_display_name,
          image_url: line_image_url,
        })
      } catch (identity_error) {
        console.error('[line_identity_create_failed]', {
          line_user_id,
          locale: profile_locale.locale,
          error: serialize_error(identity_error),
        })

        throw identity_error
      }

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
          console.error('[new_user_notify_failed]', {
            line_user_id,
            user_uuid: access.user_uuid,
            visitor_uuid: access.visitor_uuid,
            error: serialize_error(notify_error),
          })
        }
      }

      const resolved_locale = await resolve_dispatch_locale({
        source_channel: 'line',
        stored_user_locale: access.locale,
        line_profile_locale: profile_locale.raw_locale,
        webhook_source_locale:
          event.source?.locale ?? event.source?.language ?? null,
        line_user_id,
      })

      await resolve_initial_chat({
        visitor_uuid: clean_uuid(access.visitor_uuid),
        user_uuid: clean_uuid(access.user_uuid),
        channel: 'line',
        locale: resolved_locale.locale,
        line_reply_token: event.replyToken ?? null,
        line_user_id,
        incoming_line_text,
      })
    } catch (error) {
      if (event.replyToken) {
        await reply_line_webhook_error({
          reply_token: event.replyToken,
        })
      }

      console.error('[line_webhook_handler_failed]', {
        line_user_id: line_user_id ?? null,
        event_type: event.type ?? null,
        message_id: event.message?.id ?? null,
        error: serialize_error(error),
      })
    }
  }

  return NextResponse.json({ ok: true })
}
