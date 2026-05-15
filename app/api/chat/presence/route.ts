import { NextResponse } from 'next/server'

import {
  mark_room_entered,
  mark_room_left,
  mark_typing_started,
  mark_typing_stopped,
} from '@/lib/chat/presence/action'
import { resolve_presence_mutation_context } from '@/lib/chat/presence/context'

type presence_request_body = {
  room_uuid?: unknown
  participant_uuid?: unknown
  action?: unknown
  last_channel?: unknown
  typing_phase?: unknown
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | presence_request_body
    | null
  const context = resolve_presence_mutation_context({
    room_uuid: body?.room_uuid,
    participant_uuid: body?.participant_uuid,
    last_channel: body?.last_channel,
  })

  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: 400 },
    )
  }

  try {
    if (body?.action === 'enter') {
      await mark_room_entered({
        room_uuid: context.room_uuid,
        participant_uuid: context.participant_uuid,
        last_channel: context.last_channel ?? undefined,
      })
    } else if (body?.action === 'leave') {
      await mark_room_left(context)
    } else if (body?.action === 'typing_start') {
      const typing_phase =
        body?.typing_phase === 'heartbeat' ? 'heartbeat' : 'start'

      await mark_typing_started({
        room_uuid: context.room_uuid,
        participant_uuid: context.participant_uuid,
        last_channel: context.last_channel ?? undefined,
        typing_phase,
      })
    } else if (body?.action === 'typing_stop') {
      await mark_typing_stopped(context)
    } else {
      return NextResponse.json(
        { ok: false, error: 'invalid_presence_action' },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[chat_presence] update_failed', {
      room_uuid: context.room_uuid,
      participant_uuid: context.participant_uuid,
      action: body?.action,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { ok: false, error: 'presence_update_failed' },
      { status: 500 },
    )
  }
}
