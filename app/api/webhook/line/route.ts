import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import { resolve_initial_chat } from '@/lib/chat/action'
import { resolve_dispatch_locale } from '@/lib/dispatch/context'
import { fetch_line_messaging_profile } from '@/lib/line/messaging_profile'
import { notify_new_user_created } from '@/lib/notify/new_user_created'

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

export async function POST(request: Request) {
  const body_text = await request.text()

  const signature = request.headers.get('x-line-signature')

  if (!verify_line_signature(body_text, signature)) {
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

    if (event.type !== 'message') {
      const event_key = get_line_event_key(event)

      if (event.deliveryContext?.isRedelivery === true) {
        continue
      }

      if (processed_line_event_keys.has(event_key)) {
        continue
      }

      processed_line_event_keys.add(event_key)
    }

    try {
      if (!is_allowed_line_user(line_user_id)) {
        continue
      }

      if (!line_user_id) {
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

      const access = await resolve_auth_access({
        provider: 'line',
        provider_id: line_user_id,
        locale: profile_locale.locale,
        display_name: line_display_name,
        image_url: line_image_url,
      })

      if (access.is_new_user) {
        await notify_new_user_created({
          provider: 'line',
          user_uuid: access.user_uuid,
          visitor_uuid: access.visitor_uuid,
          display_name: line_display_name,
          locale: access.locale,
          is_new_user: access.is_new_user,
          is_new_visitor: access.is_new_visitor,
        })
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
        visitor_uuid: access.visitor_uuid,
        user_uuid: access.user_uuid,
        channel: 'line',
        locale: resolved_locale.locale,
        external_room_id:
          event.source?.roomId ??
          event.source?.groupId ??
          line_user_id,
        line_reply_token:
          event.type === 'message' ? (event.replyToken ?? null) : null,
        line_user_id,
        incoming_line_text:
          event.type === 'message' &&
          event.message?.type === 'text' &&
          event.message.id &&
          typeof event.message.text === 'string'
            ? {
                text: event.message.text,
                line_message_id: event.message.id,
                created_at: event.timestamp
                  ? new Date(event.timestamp).toISOString()
                  : new Date().toISOString(),
                webhook_event_id: event.webhookEventId ?? null,
                delivery_context_redelivery:
                  event.deliveryContext?.isRedelivery ?? null,
              }
            : null,
      })
    } catch {
      // resolve_auth_access or downstream must not fail the webhook
    }
  }

  return NextResponse.json({ ok: true })
}
