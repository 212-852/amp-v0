import { NextResponse } from 'next/server'

import { debug_event } from '@/lib/debug'

type chat_debug_body = {
  event?: unknown
  room_uuid?: unknown
  active_room_uuid?: unknown
  participant_uuid?: unknown
  user_uuid?: unknown
  role?: unknown
  tier?: unknown
  source_channel?: unknown
  subscribe_status?: unknown
  channel_name?: unknown
  event_name?: unknown
  schema?: unknown
  postgres_event?: unknown
  table?: unknown
  filter?: unknown
  message_uuid?: unknown
  payload_message_uuid?: unknown
  payload_action_uuid?: unknown
  payload_room_uuid?: unknown
  sender_user_uuid?: unknown
  sender_participant_uuid?: unknown
  active_participant_uuid?: unknown
  active_user_uuid?: unknown
  sender_role?: unknown
  active_role?: unknown
  display_name?: unknown
  is_typing?: unknown
  ignored_reason?: unknown
  phase?: unknown
  error_code?: unknown
  error_message?: unknown
  error_details?: unknown
  error_hint?: unknown
  prev_message_count?: unknown
  next_message_count?: unknown
  dedupe_hit?: unknown
  cleanup_reason?: unknown
  is_self_sender?: unknown
  comparison_strategy?: unknown
}

function string_or_null(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function number_or_null(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
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
      tier: string_or_null(body?.tier),
      source_channel: string_or_null(body?.source_channel) ?? 'web',
      subscribe_status: string_or_null(body?.subscribe_status),
      channel_name: string_or_null(body?.channel_name),
      event_name: string_or_null(body?.event_name),
      schema: string_or_null(body?.schema),
      postgres_event: string_or_null(body?.postgres_event),
      table: string_or_null(body?.table),
      filter: string_or_null(body?.filter),
      message_uuid: string_or_null(body?.message_uuid),
      payload_message_uuid: string_or_null(body?.payload_message_uuid),
      payload_action_uuid: string_or_null(body?.payload_action_uuid),
      payload_room_uuid: string_or_null(body?.payload_room_uuid),
      sender_user_uuid: string_or_null(body?.sender_user_uuid),
      sender_participant_uuid: string_or_null(body?.sender_participant_uuid),
      active_participant_uuid: string_or_null(body?.active_participant_uuid),
      active_user_uuid: string_or_null(body?.active_user_uuid),
      sender_role: string_or_null(body?.sender_role),
      active_role: string_or_null(body?.active_role),
      display_name: string_or_null(body?.display_name),
      is_typing:
        typeof body?.is_typing === 'boolean' ? body.is_typing : null,
      ignored_reason: string_or_null(body?.ignored_reason),
      phase: string_or_null(body?.phase),
      error_code: string_or_null(body?.error_code),
      error_message: string_or_null(body?.error_message),
      error_details: string_or_null(body?.error_details),
      error_hint: string_or_null(body?.error_hint),
      prev_message_count: number_or_null(body?.prev_message_count),
      next_message_count: number_or_null(body?.next_message_count),
      dedupe_hit:
        typeof body?.dedupe_hit === 'boolean' ? body.dedupe_hit : null,
      cleanup_reason: string_or_null(body?.cleanup_reason),
      is_self_sender:
        typeof body?.is_self_sender === 'boolean' ? body.is_self_sender : null,
      comparison_strategy: string_or_null(body?.comparison_strategy),
    },
  })

  return NextResponse.json({ ok: true })
}
