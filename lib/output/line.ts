import 'server-only'

import type { archived_message } from '@/lib/chat/archive'
import { env } from '@/lib/config/env'
import { debug_event } from '@/lib/debug'
import type {
  faq_bundle,
  how_to_use_bundle,
  message_bundle,
  quick_menu_bundle,
  welcome_bundle,
} from '@/lib/chat/message'
import type { chat_room } from '@/lib/chat/room'

import { cap_line_messages_for_reply } from './rules'

type deliver_line_chat_bundles_input = {
  room: chat_room
  messages: archived_message[]
  line_reply_token?: string | null
}

type line_api_message = Record<string, unknown>

function pick_text(content: string | { ja?: string } | undefined) {
  if (typeof content === 'string') {
    return content
  }

  return content?.ja ?? ''
}

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

function flex_text_line(
  text: string,
  options?: { weight?: string; size?: string; color?: string },
): Record<string, unknown> {
  return {
    type: 'text',
    text: truncate(text, 2000),
    wrap: true,
    ...(options?.weight ? { weight: options.weight } : {}),
    ...(options?.size ? { size: options.size } : {}),
    ...(options?.color ? { color: options.color } : {}),
  }
}

function build_flex_bubble(input: {
  alt: string
  image_url?: string | null
  lines: Array<{ text: string; weight?: string; size?: string; color?: string }>
}): line_api_message {
  const body_contents = input.lines.map((line) =>
    flex_text_line(line.text, {
      weight: line.weight,
      size: line.size,
      color: line.color,
    }),
  )

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: body_contents,
    },
  }

  if (input.image_url) {
    bubble.hero = {
      type: 'image',
      url: input.image_url,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    }
  }

  return {
    type: 'flex',
    altText: truncate(input.alt, 400),
    contents: bubble,
  }
}

function welcome_to_line_message(bundle: welcome_bundle): line_api_message {
  const title = pick_text(bundle.payload.title)
  const text = pick_text(bundle.payload.text)

  return {
    type: 'text',
    text: truncate(`${title}\n${text}`, 5000),
  }
}

function quick_menu_to_line_message(bundle: quick_menu_bundle): line_api_message {
  const p = bundle.payload
  const title = pick_text(p.title)
  const lines: Array<{
    text: string
    weight?: string
    size?: string
    color?: string
  }> = [{ text: title, weight: 'bold', size: 'lg' }]

  if (p.subtitle) {
    lines.push({
      text: pick_text(p.subtitle),
      size: 'sm',
      color: '#a1887f',
    })
  }

  for (const item of p.items) {
    lines.push({ text: pick_text(item.label), weight: 'bold' })
  }

  if (p.support_heading) {
    lines.push({ text: pick_text(p.support_heading), weight: 'bold' })
  }

  if (p.support_body) {
    lines.push({ text: pick_text(p.support_body), size: 'sm' })
  }

  if (p.links) {
    for (const link of p.links) {
      lines.push({
        text: pick_text(link.label),
        size: 'sm',
        color: '#c9a77d',
      })
    }
  }

  const image_url = to_absolute_asset_url(p.image.src)

  try {
    return build_flex_bubble({
      alt: title,
      image_url,
      lines,
    })
  } catch {
    return {
      type: 'text',
      text: truncate(
        lines.map((row) => row.text).join('\n'),
        5000,
      ),
    }
  }
}

function how_to_use_to_line_message(bundle: how_to_use_bundle): line_api_message {
  const p = bundle.payload
  const title = pick_text(p.title)
  const lines: Array<{
    text: string
    weight?: string
    size?: string
    color?: string
  }> = [{ text: title, weight: 'bold', size: 'lg' }]

  for (const step of p.steps) {
    const line = pick_text(step.title)
    const desc = pick_text(step.description).trim()
    lines.push({
      text: desc ? `${line}\n${desc}` : line,
    })
  }

  if (p.notice_heading) {
    lines.push({ text: pick_text(p.notice_heading), weight: 'bold' })
  }

  if (p.notice_body) {
    lines.push({ text: pick_text(p.notice_body), size: 'sm' })
  }

  if (p.footer_link_label) {
    lines.push({
      text: pick_text(p.footer_link_label),
      size: 'sm',
      color: '#c9a77d',
    })
  }

  const image_url = to_absolute_asset_url(p.image.src)

  try {
    return build_flex_bubble({
      alt: title,
      image_url,
      lines,
    })
  } catch {
    return {
      type: 'text',
      text: truncate(
        lines.map((row) => row.text).join('\n'),
        5000,
      ),
    }
  }
}

function faq_to_line_message(bundle: faq_bundle): line_api_message {
  const p = bundle.payload
  const title = pick_text(p.title)
  const lines: Array<{
    text: string
    weight?: string
    size?: string
    color?: string
  }> = [{ text: title, weight: 'bold', size: 'lg' }]

  for (const item of p.items) {
    lines.push({ text: pick_text(item.question), weight: 'bold' })
    const answer = pick_text(item.answer).trim()
    if (answer) {
      lines.push({ text: answer, size: 'sm' })
    }
  }

  if (p.primary_cta_label) {
    lines.push({
      text: pick_text(p.primary_cta_label),
      weight: 'bold',
      color: '#c9a77d',
    })
  }

  const image_url = to_absolute_asset_url(p.image.src)

  try {
    return build_flex_bubble({
      alt: title,
      image_url,
      lines,
    })
  } catch {
    return {
      type: 'text',
      text: truncate(
        lines.map((row) => row.text).join('\n'),
        5000,
      ),
    }
  }
}

function text_bundle_to_line_message(bundle: {
  payload: { text: string | { ja?: string } }
}): line_api_message {
  return {
    type: 'text',
    text: truncate(pick_text(bundle.payload.text), 5000),
  }
}

function archived_bundle_to_line_message(
  bundle: message_bundle,
): line_api_message {
  if (bundle.bundle_type === 'welcome') {
    return welcome_to_line_message(bundle)
  }

  if (bundle.bundle_type === 'quick_menu') {
    return quick_menu_to_line_message(bundle)
  }

  if (bundle.bundle_type === 'how_to_use') {
    return how_to_use_to_line_message(bundle)
  }

  if (bundle.bundle_type === 'faq') {
    return faq_to_line_message(bundle)
  }

  if (bundle.bundle_type === 'text') {
    return text_bundle_to_line_message(bundle)
  }

  return {
    type: 'text',
    text: truncate(JSON.stringify(bundle), 5000),
  }
}

type line_reply_error = Error & {
  line_status?: number
  line_body?: string
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
}

export async function deliver_line_chat_bundles(
  input: deliver_line_chat_bundles_input,
) {
  const reply_token = input.line_reply_token

  if (!reply_token || input.messages.length === 0) {
    return
  }

  const bundles = input.messages.map((row) => row.bundle)

  await debug_event({
    category: 'line_webhook',
    event: 'line_output_started',
    payload: {
      room_uuid: input.room.room_uuid,
      reply_token_exists: Boolean(reply_token),
      bundle_count: bundles.length,
    },
  })

  let line_messages: line_api_message[]

  try {
    line_messages = cap_line_messages_for_reply(
      bundles.map((bundle) => archived_bundle_to_line_message(bundle)),
    )
  } catch (conversion_error) {
    await debug_event({
      category: 'line_webhook',
      event: 'line_reply_failed',
      payload: {
        room_uuid: input.room.room_uuid,
        error_message:
          conversion_error instanceof Error
            ? conversion_error.message
            : String(conversion_error),
        error_status: undefined,
        error_body: undefined,
      },
    })

    return
  }

  if (line_messages.length === 0) {
    return
  }

  await debug_event({
    category: 'line_webhook',
    event: 'line_reply_attempted',
    payload: {
      room_uuid: input.room.room_uuid,
      reply_message_count: line_messages.length,
    },
  })

  try {
    await post_line_reply_messages({
      reply_token,
      messages: line_messages,
    })

    await debug_event({
      category: 'line_webhook',
      event: 'line_reply_succeeded',
      payload: {
        room_uuid: input.room.room_uuid,
      },
    })
  } catch (reply_error) {
    const err = reply_error as line_reply_error

    await debug_event({
      category: 'line_webhook',
      event: 'line_reply_failed',
      payload: {
        room_uuid: input.room.room_uuid,
        error_message:
          reply_error instanceof Error
            ? reply_error.message
            : String(reply_error),
        error_status: err.line_status,
        error_body: err.line_body,
      },
    })
  }
}
