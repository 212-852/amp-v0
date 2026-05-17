import 'server-only'

import { debug_event } from '@/lib/debug'

type line_reply_message = {
  type: string
  text?: string
  altText?: string
  contents?: Record<string, unknown>
}

function line_flex_new_chat_message(input: {
  title: string
  body: string
  open_url: string
  cta_label?: string
}): line_reply_message {
  const cta_label =
    typeof input.cta_label === 'string' && input.cta_label.trim().length > 0
      ? input.cta_label.trim()
      : '\u30c1\u30e3\u30c3\u30c8\u3092\u958b\u304f'

  const body_contents: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: input.title,
      weight: 'bold',
      size: 'lg',
      wrap: true,
    },
  ]

  if (input.body.trim().length > 0) {
    body_contents.push({
      type: 'text',
      text: input.body,
      size: 'sm',
      wrap: true,
    })
  }

  body_contents.push(
    {
      type: 'separator',
      margin: 'md',
    },
    {
      type: 'button',
      style: 'primary',
      height: 'sm',
      action: {
        type: 'uri',
        label: cta_label,
        uri: input.open_url,
      },
    },
  )

  return {
    type: 'flex',
    altText: input.title,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: body_contents,
      },
    },
  }
}

export async function send_line_reply(input: {
  reply_token: string
  messages: line_reply_message[]
}) {
  const access_token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN

  if (!access_token) {
    throw new Error('missing LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')
  }

  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      replyToken: input.reply_token,
      messages: input.messages,
    }),
  })

  if (!response.ok) {
    const body_text = await response.text()
    throw new Error(`line reply failed: ${response.status} ${body_text}`)
  }
}

export type line_push_notify_input = {
  line_user_id: string
  /** Plain single text push (legacy / concierge personal). */
  message?: string
  user_uuid?: string | null
  room_uuid?: string | null
  message_uuid?: string | null
  last_channel?: string | null
  open_url?: string | null
  title?: string | null
  body?: string | null
  cta_label?: string | null
  should_include_body?: boolean
  selected_route?: string | null
}

export type line_push_notify_result = {
  ok: boolean
  http_status?: number | null
  error_code?: string | null
  error_message?: string | null
}

export async function send_line_push_notify(
  input: line_push_notify_input,
): Promise<line_push_notify_result> {
  const access_token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN

  if (!access_token) {
    throw new Error('line_access_token_missing')
  }

  const structured =
    typeof input.title === 'string' &&
    input.title.trim().length > 0 &&
    typeof input.body === 'string' &&
    input.body.trim().length > 0 &&
    typeof input.open_url === 'string' &&
    input.open_url.trim().length > 0

  let messages: line_reply_message[]

  if (structured) {
    const title = input.title!.trim()
    const body = input.body!.trim()
    const open_url = input.open_url!.trim()

    await debug_event({
      category: 'pwa',
      event: 'notify_line_last_channel_resolved',
      payload: {
        user_uuid: input.user_uuid ?? null,
        room_uuid: input.room_uuid ?? null,
        message_uuid: input.message_uuid ?? null,
        last_channel: input.last_channel ?? null,
        should_include_body: Boolean(input.should_include_body),
        open_url_exists: open_url.length > 0,
        selected_route: input.selected_route ?? null,
      },
    })

    await debug_event({
      category: 'pwa',
      event: 'notify_line_open_url_resolved',
      payload: {
        user_uuid: input.user_uuid ?? null,
        room_uuid: input.room_uuid ?? null,
        message_uuid: input.message_uuid ?? null,
        last_channel: input.last_channel ?? null,
        should_include_body: Boolean(input.should_include_body),
        open_url_exists: open_url.length > 0,
        selected_route: input.selected_route ?? null,
        open_url,
      },
    })

    messages = [
      line_flex_new_chat_message({
        title,
        body,
        open_url,
        cta_label: input.cta_label ?? undefined,
      }),
    ]

    await debug_event({
      category: 'pwa',
      event: 'notify_line_payload_built',
      payload: {
        user_uuid: input.user_uuid ?? null,
        room_uuid: input.room_uuid ?? null,
        message_uuid: input.message_uuid ?? null,
        last_channel: input.last_channel ?? null,
        should_include_body: Boolean(input.should_include_body),
        open_url_exists: open_url.length > 0,
        selected_route: input.selected_route ?? null,
        payload_kind: 'flex_new_chat',
        title_length: title.length,
        body_length: body.length,
      },
    })
  } else {
    const text =
      typeof input.message === 'string' && input.message.trim()
        ? input.message.trim()
        : ''

    if (!text) {
      throw new Error('line_push_message_empty')
    }

    messages = [{ type: 'text', text }]
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      to: input.line_user_id,
      messages,
    }),
  })

  if (!response.ok) {
    const body_text = await response.text()
    throw new Error(`line_push_failed:${response.status}:${body_text}`)
  }

  if (structured) {
    await debug_event({
      category: 'pwa',
      event: 'notification_line_sent',
      payload: {
        user_uuid: input.user_uuid ?? null,
        room_uuid: input.room_uuid ?? null,
        message_uuid: input.message_uuid ?? null,
        last_channel: input.last_channel ?? null,
        should_include_body: Boolean(input.should_include_body),
        open_url_exists: Boolean(input.open_url && input.open_url.trim().length > 0),
        selected_route: input.selected_route ?? null,
      },
    })
  }

  return {
    ok: true,
    http_status: response.status,
    error_code: null,
    error_message: null,
  }
}
