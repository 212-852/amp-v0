import 'server-only'

import type { archived_message } from '@/lib/chat/archive'
import { env } from '@/lib/config/env'
import type { message_bundle } from '@/lib/chat/message'
import type { chat_room } from '@/lib/chat/room'

import { build_line_messages_from_bundles } from './line/flex'

type deliver_line_chat_bundles_input = {
  room: chat_room
  messages: archived_message[]
  line_reply_token?: string | null
  line_user_id?: string | null
}

type line_api_message = Record<string, unknown>

function truncate(s: string, max: number) {
  if (s.length <= max) {
    return s
  }

  return `${s.slice(0, max - 1)}…`
}

function to_absolute_asset_url(path: string): string | null {
  const base = env.app_url.replace(/\/$/, '')

  if (!base.startsWith('https://') || !path.startsWith('/')) {
    return null
  }

  return `${base}${path}`
}

function build_flex_failure_text_fallback(
  bundles: message_bundle[],
): line_api_message[] {
  const lines: string[] = []

  for (const bundle of bundles) {
    if (bundle.bundle_type === 'welcome') {
      lines.push(`${bundle.payload.title}\n${bundle.payload.text}`)
    }

    if (bundle.bundle_type === 'initial_carousel') {
      for (const card of bundle.cards) {
        if (card.bundle_type === 'quick_menu') {
          const p = card.payload
          lines.push(
            [
              p.title,
              p.subtitle,
              ...p.items.map((i) => i.label),
              p.support_heading,
              p.support_body,
              ...(p.links?.map((l) => l.label) ?? []),
            ]
              .filter(Boolean)
              .join('\n'),
          )
        }

        if (card.bundle_type === 'how_to_use') {
          const p = card.payload
          lines.push(
            [
              p.title,
              ...p.steps.map((s) =>
                s.description.trim()
                  ? `${s.title}\n${s.description}`
                  : s.title,
              ),
              p.notice_heading,
              p.notice_body,
              p.footer_link_label,
            ]
              .filter(Boolean)
              .join('\n'),
          )
        }

        if (card.bundle_type === 'faq') {
          const p = card.payload
          lines.push(
            [
              p.title,
              ...p.items.flatMap((i) =>
                i.answer.trim() ? [i.question, i.answer] : [i.question],
              ),
              p.primary_cta_label,
            ]
              .filter(Boolean)
              .join('\n'),
          )
        }
      }
    }

    if (bundle.bundle_type === 'quick_menu') {
      const p = bundle.payload
      lines.push(
        [
          p.title,
          p.subtitle,
          ...p.items.map((i) => i.label),
          p.support_heading,
          p.support_body,
          ...(p.links?.map((l) => l.label) ?? []),
        ]
          .filter(Boolean)
          .join('\n'),
      )
    }

    if (bundle.bundle_type === 'how_to_use') {
      const p = bundle.payload
      lines.push(
        [
          p.title,
          ...p.steps.map((s) =>
            s.description.trim() ? `${s.title}\n${s.description}` : s.title,
          ),
          p.notice_heading,
          p.notice_body,
          p.footer_link_label,
        ]
          .filter(Boolean)
          .join('\n'),
      )
    }

    if (bundle.bundle_type === 'faq') {
      const p = bundle.payload
      lines.push(
        [
          p.title,
          ...p.items.flatMap((i) =>
            i.answer.trim() ? [i.question, i.answer] : [i.question],
          ),
          p.primary_cta_label,
        ]
          .filter(Boolean)
          .join('\n'),
      )
    }

    if (bundle.bundle_type === 'driver_recruitment') {
      const p = bundle.payload
      lines.push(
        [
          p.title,
          p.summary,
          ...p.sections.flatMap((section) => [section.heading, section.body]),
          ...p.ctas.map((cta) => cta.label),
        ]
          .filter(Boolean)
          .join('\n'),
      )
    }

    if (bundle.bundle_type === 'text') {
      lines.push(bundle.payload.text)
    }
  }

  return [
    {
      type: 'text',
      text: truncate(lines.join('\n\n'), 5000),
    },
  ]
}

type line_reply_error = Error & {
  line_status?: number
  line_body?: string
}

function serialize_error(error: unknown) {
  return {
    name: error instanceof Error ? error.name : null,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    error,
  }
}

async function post_line_reply_messages(input: {
  reply_token: string
  messages: line_api_message[]
}) {
  const access_token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN

  if (!access_token) {
    const err = new Error(
      'missing LINE_MESSAGING_CHANNEL_ACCESS_TOKEN',
    ) as line_reply_error
    throw err
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
    const err = new Error(
      `line reply failed: ${response.status}`,
    ) as line_reply_error
    err.line_status = response.status
    err.line_body = truncate(body_text, 2000)
    throw err
  }

  return response.status
}

async function post_line_push_messages(input: {
  line_user_id: string
  messages: line_api_message[]
}) {
  const access_token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN

  if (!access_token) {
    const err = new Error(
      'missing LINE_MESSAGING_CHANNEL_ACCESS_TOKEN',
    ) as line_reply_error
    throw err
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      to: input.line_user_id,
      messages: input.messages,
    }),
  })

  if (!response.ok) {
    const body_text = await response.text()
    const err = new Error(
      `line push failed: ${response.status}`,
    ) as line_reply_error
    err.line_status = response.status
    err.line_body = truncate(body_text, 2000)
    throw err
  }

  return response.status
}

export async function deliver_line_text_reply(input: {
  reply_token: string | null | undefined
  text: string
}) {
  if (!input.reply_token?.trim()) {
    return null
  }

  return post_line_reply_messages({
    reply_token: input.reply_token,
    messages: [
      {
        type: 'text',
        text: truncate(input.text, 5000),
      },
    ],
  })
}

export async function deliver_line_chat_bundles(
  input: deliver_line_chat_bundles_input,
) {
  const reply_token = input.line_reply_token
  const line_user_id = input.line_user_id?.trim() ?? ''

  if (input.messages.length === 0) {
    return
  }

  const bundles = input.messages.map((row) => row.bundle)
  const bundle_count = bundles.length
  const line_trace_base = {
    line_user_id: input.line_user_id ?? null,
    user_uuid: input.room.user_uuid,
    room_uuid: input.room.room_uuid,
    participant_uuid: input.room.participant_uuid,
  }

  let line_messages: line_api_message[]

  try {
    const built = build_line_messages_from_bundles({
      bundles,
      absolute_url: to_absolute_asset_url,
    })
    line_messages = built.messages
  } catch (flex_error) {
    console.error(
      '[line_flex_render_failed]',
      line_trace_base,
      flex_error,
    )

    line_messages = build_flex_failure_text_fallback(bundles)
  }

  const line_message_count = line_messages.length

  try {
    if (reply_token?.trim()) {
      await post_line_reply_messages({
        reply_token,
        messages: line_messages,
      })
      return
    }

    if (line_user_id) {
      await post_line_push_messages({
        line_user_id,
        messages: line_messages,
      })
      return
    }

    throw new Error('line_delivery_target_missing')
  } catch (line_error) {
    const err = line_error as line_reply_error

    console.error('[line_delivery_failed]', line_trace_base, {
      error: serialize_error(line_error),
      error_status: err.line_status,
      error_body: err.line_body,
      bundle_count,
      line_message_count,
    })

    throw line_error
  }
}
