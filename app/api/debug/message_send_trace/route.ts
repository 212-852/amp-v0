import { NextResponse } from 'next/server'

import { emit_message_send_diagnostic_pair } from '@/lib/debug/message_send_diagnostic'

type body_shape = {
  chat_event?: unknown
  user_event?: unknown
  payload?: unknown
}

function string_field(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as body_shape | null
  const chat_event = string_field(body?.chat_event)
  const user_event = string_field(body?.user_event)
  const payload =
    body?.payload && typeof body.payload === 'object' && body.payload !== null
      ? (body.payload as Record<string, unknown>)
      : {}

  if (!chat_event || !user_event) {
    return NextResponse.json(
      { ok: false, error: 'missing_chat_event_or_user_event' },
      { status: 400 },
    )
  }

  await emit_message_send_diagnostic_pair({
    chat_event,
    user_event,
    payload,
  })

  return NextResponse.json({ ok: true })
}
