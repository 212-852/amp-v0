import { NextResponse } from 'next/server'

import {
  mark_admin_support_heartbeat,
  mark_admin_support_idle_notice,
  mark_admin_support_join,
  mark_admin_support_recovered_notice,
  expire_admin_support_presence,
  mark_room_entered,
  mark_room_left,
  mark_typing_started,
  mark_typing_stopped,
} from '@/lib/chat/presence/action'
import { leave_support_room } from '@/lib/support_presence/action'
import { resolve_presence_mutation_context } from '@/lib/chat/presence/context'

type presence_request_body = {
  room_uuid?: unknown
  participant_uuid?: unknown
  action?: unknown
  last_channel?: unknown
  active_area?: unknown
  typing_phase?: unknown
  leave_reason?: unknown
  previous_active_room_uuid?: unknown
  next_active_room_uuid?: unknown
  support_session_key?: unknown
  active_room_uuid?: unknown
}

function support_session_key_or_null(body: presence_request_body): string | null {
  const raw = body.support_session_key

  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | presence_request_body
    | null
  const raw_action = typeof body?.action === 'string' ? body.action : ''
  const last_channel_raw =
    body?.last_channel ??
    (raw_action.startsWith('admin_support') ? 'web' : undefined)

  if (raw_action === 'admin_support_timeout_check') {
    try {
      const expired = await expire_admin_support_presence({
        room_uuid: typeof body?.room_uuid === 'string' ? body.room_uuid : null,
      })

      await Promise.all(
        expired.map((row) =>
          leave_support_room({
            room_uuid: row.room_uuid,
            staff_participant_uuid: row.participant_uuid,
            leave_reason: 'heartbeat_timeout',
            previous_active_room_uuid: row.room_uuid,
            next_active_room_uuid: null,
          }),
        ),
      )

      return NextResponse.json({ ok: true })
    } catch (error) {
      console.error('[chat_presence] timeout_check_failed', {
        room_uuid: body?.room_uuid,
        error: error instanceof Error ? error.message : String(error),
      })

      return NextResponse.json(
        { ok: false, error: 'presence_timeout_check_failed' },
        { status: 500 },
      )
    }
  }

  const context = resolve_presence_mutation_context({
    room_uuid: body?.room_uuid,
    participant_uuid: body?.participant_uuid,
    last_channel: last_channel_raw,
    active_area: body?.active_area,
  })

  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: 400 },
    )
  }

  const room_uuid = context.room_uuid
  const participant_uuid = context.participant_uuid

  try {
    if (body?.action === 'enter') {
      await mark_room_entered({
        room_uuid,
        participant_uuid,
        last_channel: context.last_channel ?? undefined,
        active_area: context.active_area ?? 'chat_room',
      })
    } else if (body?.action === 'leave') {
      await mark_room_left({
        room_uuid,
        participant_uuid,
      })
    } else if (body?.action === 'typing_start') {
      const typing_phase =
        body?.typing_phase === 'heartbeat' ? 'heartbeat' : 'start'

      await mark_typing_started({
        room_uuid,
        participant_uuid,
        last_channel: context.last_channel ?? undefined,
        typing_phase,
      })
    } else if (body?.action === 'typing_stop') {
      await mark_typing_stopped({
        room_uuid,
        participant_uuid,
        last_channel: context.last_channel ?? undefined,
      })
    } else if (body?.action === 'admin_support_join') {
      await mark_admin_support_join({
        room_uuid,
        participant_uuid,
        last_channel: context.last_channel ?? 'web',
        active_area: context.active_area ?? 'admin_reception_room',
      })
    } else if (body?.action === 'admin_support_heartbeat') {
      await mark_admin_support_heartbeat({
        room_uuid,
        participant_uuid,
        last_channel: context.last_channel ?? 'web',
        active_area: context.active_area ?? 'admin_reception_room',
      })
    } else if (body?.action === 'admin_support_leave') {
      const left = await leave_support_room({
        room_uuid,
        staff_participant_uuid: participant_uuid,
        leave_reason:
          typeof body.leave_reason === 'string'
            ? body.leave_reason
            : 'admin_support_leave',
        previous_active_room_uuid:
          typeof body.previous_active_room_uuid === 'string'
            ? body.previous_active_room_uuid
            : room_uuid,
        next_active_room_uuid:
          typeof body.next_active_room_uuid === 'string'
            ? body.next_active_room_uuid
            : null,
        support_session_key: support_session_key_or_null(body),
      })

      return NextResponse.json({
        ok: true,
        skipped: left.ok === true && left.skipped === true,
        action: left.ok === true ? left.action : undefined,
      })
    } else if (body?.action === 'admin_support_page_unload') {
      const left = await leave_support_room({
        room_uuid,
        staff_participant_uuid: participant_uuid,
        leave_reason:
          typeof body.leave_reason === 'string'
            ? body.leave_reason
            : 'page_unload',
        previous_active_room_uuid:
          typeof body.previous_active_room_uuid === 'string'
            ? body.previous_active_room_uuid
            : room_uuid,
        next_active_room_uuid:
          typeof body.next_active_room_uuid === 'string'
            ? body.next_active_room_uuid
            : null,
        support_session_key: support_session_key_or_null(body),
        debug_event_name: 'admin_presence_page_unload',
      })

      return NextResponse.json({
        ok: true,
        skipped: left.ok === true && left.skipped === true,
        action: left.ok === true ? left.action : undefined,
      })
    } else if (body?.action === 'admin_support_idle') {
      await mark_admin_support_idle_notice({ room_uuid, participant_uuid })
    } else if (body?.action === 'admin_support_recovered') {
      await mark_admin_support_recovered_notice({
        room_uuid,
        participant_uuid,
        last_channel: context.last_channel ?? 'web',
        active_area: context.active_area ?? 'admin_reception_room',
      })
    } else {
      return NextResponse.json(
        { ok: false, error: 'invalid_presence_action' },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[chat_presence] update_failed', {
      room_uuid,
      participant_uuid,
      action: body?.action,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { ok: false, error: 'presence_update_failed' },
      { status: 500 },
    )
  }
}
