import 'server-only'

import type { archived_message } from '@/lib/chat/archive'
import { control } from '@/lib/config/control'
import { env } from '@/lib/config/env'
import { debug_event, forced_debug_event } from '@/lib/debug'
import type { message_bundle } from '@/lib/chat/message'
import type { chat_room } from '@/lib/chat/room'

import { build_seed_carousel_line_messages } from './line/flex'

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

  if (!reply_token?.trim()) {
    if (control.debug.line_webhook) {
      await debug_event({
        category: 'line_webhook',
        event: 'line_reply_skipped',
        payload: {
          reason: 'no_reply_token',
          room_uuid: input.room.room_uuid,
          line_user_id: input.line_user_id ?? null,
        },
      })
    }

    return
  }

  if (input.messages.length === 0) {
    if (control.debug.line_webhook) {
      await debug_event({
        category: 'line_webhook',
        event: 'line_reply_skipped',
        payload: {
          reason: 'no_messages',
          room_uuid: input.room.room_uuid,
          line_user_id: input.line_user_id ?? null,
        },
      })
    }

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
  let flex_bubble_count = 0

  try {
    const built = build_seed_carousel_line_messages({
      bundles,
      absolute_url: to_absolute_asset_url,
    })
    line_messages = built.messages
    flex_bubble_count = built.flex_bubble_count
  } catch (flex_error) {
    console.error(
      '[line_flex_render_failed]',
      line_trace_base,
      flex_error,
    )

    line_messages = build_flex_failure_text_fallback(bundles)
    flex_bubble_count = 0
  }

  const line_message_count = line_messages.length

  if (control.debug.line_webhook) {
    await debug_event({
      category: 'line_webhook',
      event: 'line_reply_attempted',
      payload: {
        ...line_trace_base,
        bundle_count,
        line_message_count,
        flex_bubble_count,
      },
    })
    await debug_event({
      category: 'line_webhook',
      event: 'line_reply_started',
      payload: {
        ...line_trace_base,
        bundle_count,
        line_message_count,
        flex_bubble_count,
      },
    })
  }

  try {
    await forced_debug_event({
      category: 'line_webhook',
      event: 'line_reply_started',
      payload: {
        reply_token_exists: Boolean(reply_token),
        message_count: line_message_count,
      },
    })

    const reply_status = await post_line_reply_messages({
      reply_token,
      messages: line_messages,
    })

    await forced_debug_event({
      category: 'line_webhook',
      event: 'line_reply_completed',
      payload: {
        ok: true,
        status: reply_status,
      },
    })

    if (control.debug.line_webhook) {
      await debug_event({
        category: 'line_webhook',
        event: 'line_reply_succeeded',
        payload: {
          ...line_trace_base,
          bundle_count,
          line_message_count,
          line_reply_message_count: line_message_count,
          flex_bubble_count,
          line_flex_bubble_count: flex_bubble_count,
        },
      })
    }
    if (control.debug.line_webhook) {
      await debug_event({
        category: 'line_webhook',
        event: 'line_reply_completed',
        payload: {
          ...line_trace_base,
          bundle_count,
          line_message_count,
          line_reply_message_count: line_message_count,
          flex_bubble_count,
          line_flex_bubble_count: flex_bubble_count,
        },
      })
    }
  } catch (reply_error) {
    const err = reply_error as line_reply_error

    console.error('[line_reply_failed]', line_trace_base, {
      error: serialize_error(reply_error),
      error_status: err.line_status,
      error_body: err.line_body,
      bundle_count,
      line_message_count,
    })

    await forced_debug_event({
      category: 'line_webhook',
      event: 'line_reply_completed',
      payload: {
        ok: false,
        status: err.line_status ?? null,
      },
    })

    if (control.debug.line_webhook) {
      await debug_event({
        category: 'line_webhook',
        event: 'line_reply_failed',
        payload: {
          ...line_trace_base,
          bundle_count,
          line_message_count,
          error: serialize_error(reply_error),
          error_message:
            reply_error instanceof Error ? reply_error.message : null,
          line_status: err.line_status ?? null,
          line_body_preview: err.line_body ?? null,
        },
      })
    }
  }
}
