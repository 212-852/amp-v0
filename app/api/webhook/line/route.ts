import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import { control } from '@/lib/config/control'
import { debug } from '@/lib/debug'

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

function fire_line_auth_debug(
  payload: Parameters<typeof debug>[0],
) {
  if (!control.debug.line_auth) {
    return
  }

  void (async () => {
    try {
      await debug(payload)
    } catch {
      // never block webhook response
    }
  })()
}

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

function append_line_webhook_meta(
  data: Record<string, unknown>,
  event: line_webhook_event,
) {
  const webhook_event_id = event.webhookEventId

  if (
    webhook_event_id != null &&
    String(webhook_event_id).length > 0
  ) {
    data.webhook_event_id = webhook_event_id
  }

  const redelivery = event.deliveryContext?.isRedelivery

  if (typeof redelivery === 'boolean') {
    data.delivery_context_redelivery = redelivery
  }
}

export async function POST(request: Request) {
  const body_text = await request.text()
  const signature = request.headers.get('x-line-signature')

  if (!verify_line_signature(body_text, signature)) {
    fire_line_auth_debug({
      category: 'line',
      event: 'line_webhook_signature_invalid',
      data: {
        has_signature: Boolean(signature),
      },
    })

    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 },
    )
  }

  const body = JSON.parse(body_text) as line_webhook_body
  const events = body.events ?? []

  for (const event of events) {
    const line_user_id = event.source?.userId
    const event_key = get_line_event_key(event)

    if (event.deliveryContext?.isRedelivery === true) {
      continue
    }

    if (processed_line_event_keys.has(event_key)) {
      continue
    }

    processed_line_event_keys.add(event_key)

    try {
      if (!is_allowed_line_user(line_user_id)) {
        fire_line_auth_debug({
          category: 'line',
          event: 'line_webhook_test_blocked',
          data: {
            line_user_id,
            event_type: event.type,
            source_type: event.source?.type,
            message_id: event.message?.id,
            reply_token: event.replyToken,
            timestamp: event.timestamp,
          },
        })

        continue
      }

      if (!line_user_id) {
        fire_line_auth_debug({
          category: 'line',
          event: 'line_webhook_missing_user_id',
          data: {
            event_type: event.type,
            source_type: event.source?.type,
            destination: body.destination,
          },
        })

        continue
      }

      const access = await resolve_auth_access({
        provider: 'line',
        provider_id: line_user_id,
      })

      const passed_data: Record<string, unknown> = {
        user_uuid: access.user_uuid,
        visitor_uuid: access.visitor_uuid,
        is_new_user: access.is_new_user,
        is_new_visitor: access.is_new_visitor,

        line_user_id,
        event_type: event.type,
        source_type: event.source?.type,
        message_type: event.message?.type,
        message_id: event.message?.id,
        message_text:
          event.message?.type === 'text'
            ? event.message.text
            : undefined,
        reply_token: event.replyToken,
        reply_token_exists: Boolean(event.replyToken),
        timestamp: event.timestamp,
        destination: body.destination,
      }

      append_line_webhook_meta(passed_data, event)

      fire_line_auth_debug({
        category: 'line',
        event: 'line_webhook_passed',
        data: passed_data,
      })
    } catch {
      // resolve_auth_access or downstream must not fail the webhook
    }
  }

  return NextResponse.json({ ok: true })
}
