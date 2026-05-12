import { NextResponse } from 'next/server'

import { debug_event } from '@/lib/debug'

type chat_debug_body = {
  event?: unknown
  room_uuid?: unknown
  active_room_uuid?: unknown
  participant_uuid?: unknown
  user_uuid?: unknown
  role?: unknown
  source_channel?: unknown
  subscribe_status?: unknown
  postgres_event?: unknown
  table?: unknown
  filter?: unknown
  message_uuid?: unknown
  payload_room_uuid?: unknown
  sender_user_uuid?: unknown
  ignored_reason?: unknown
  phase?: unknown
  error_code?: unknown
  error_message?: unknown
  error_details?: unknown
  error_hint?: unknown
}

function string_or_null(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as chat_debug_body | null
  const event = string_or_null(body?.event)

  if (!event) {
    return NextResponse.json(
      { ok: false, error: 'missing_debug_event' },
      { status: 400 },
    )
  }

  await debug_event({
    category: 'chat_realtime',
    event,
    payload: {
      room_uuid: string_or_null(body?.room_uuid),
      active_room_uuid: string_or_null(body?.active_room_uuid),
      participant_uuid: string_or_null(body?.participant_uuid),
      user_uuid: string_or_null(body?.user_uuid),
      role: string_or_null(body?.role),
      source_channel: string_or_null(body?.source_channel) ?? 'web',
      subscribe_status: string_or_null(body?.subscribe_status),
      postgres_event: string_or_null(body?.postgres_event),
      table: string_or_null(body?.table),
      filter: string_or_null(body?.filter),
      message_uuid: string_or_null(body?.message_uuid),
      payload_room_uuid: string_or_null(body?.payload_room_uuid),
      sender_user_uuid: string_or_null(body?.sender_user_uuid),
      ignored_reason: string_or_null(body?.ignored_reason),
      phase: string_or_null(body?.phase),
      error_code: string_or_null(body?.error_code),
      error_message: string_or_null(body?.error_message),
      error_details: string_or_null(body?.error_details),
      error_hint: string_or_null(body?.error_hint),
    },
  })

  return NextResponse.json({ ok: true })
}
