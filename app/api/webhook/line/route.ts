import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import { control } from '@/lib/config/control'
import { debug } from '@/lib/debug'

type line_webhook_event = {
  type?: string
  replyToken?: string
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

export async function POST(request: Request) {
  const body_text = await request.text()
  const signature = request.headers.get('x-line-signature')

  if (!verify_line_signature(body_text, signature)) {
    if (control.debug.line_auth) {
      await debug({
        category: 'line',
        event: 'line_webhook_signature_invalid',
        data: {
          has_signature: Boolean(signature),
        },
      })
    }

    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 },
    )
  }

  const body = JSON.parse(body_text) as line_webhook_body
  const events = body.events ?? []

  for (const event of events) {
    const line_user_id = event.source?.userId

    if (!is_allowed_line_user(line_user_id)) {
      if (control.debug.line_auth) {
        await debug({
          category: 'line',
          event: 'line_webhook_test_blocked',
          data: {
            line_user_id,
            event_type: event.type,
            source_type: event.source?.type,
          },
        })
      }

      continue
    }

    if (!line_user_id) {
      if (control.debug.line_auth) {
        await debug({
          category: 'line',
          event: 'line_webhook_missing_user_id',
          data: {
            event_type: event.type,
            source_type: event.source?.type,
            destination: body.destination,
          },
        })
      }

      continue
    }

    const access = await resolve_auth_access({
      provider: 'line',
      provider_id: line_user_id,
    })

    if (control.debug.line_auth) {
      await debug({
        category: 'line',
        event: 'line_webhook_passed',
        data: {
          user_uuid: access.user_uuid,
          visitor_uuid: access.visitor_uuid,
          is_new_user: access.is_new_user,
          is_new_visitor: access.is_new_visitor,

          line_user_id,
          event_type: event.type,
          source_type: event.source?.type,
          message_type: event.message?.type,
          message_text:
            event.message?.type === 'text'
              ? event.message.text
              : undefined,
          reply_token_exists: Boolean(event.replyToken),
          destination: body.destination,
        },
      })
    }
  }

  return NextResponse.json({ ok: true })
}