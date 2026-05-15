import 'server-only'

import {
  handle_admin_reception_room_opened,
  record_admin_support_left_session,
} from '@/lib/chat/action'
import { mark_admin_support_leave } from '@/lib/chat/presence/action'
import { debug_event } from '@/lib/debug'

function clean_text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function enter_support_room(request: Request) {
  const body = (await request.clone().json().catch(() => null)) as {
    room_uuid?: unknown
  } | null
  const room_uuid = clean_text(body?.room_uuid)

  await debug_event({
    category: 'admin_chat',
    event: 'enter_support_room_started',
    payload: {
      room_uuid,
      active_room_uuid: room_uuid,
      previous_room_uuid: null,
      next_room_uuid: room_uuid,
      admin_user_uuid: null,
      admin_participant_uuid: null,
      reason: 'api_reception_open',
      error_code: null,
      error_message: null,
    },
  })

  try {
    const result = await handle_admin_reception_room_opened(request)
    const skipped = result.body.ok === true && result.body.skipped === true

    await debug_event({
      category: 'admin_chat',
      event: skipped ? 'enter_support_room_skipped' : 'enter_support_room_succeeded',
      payload: {
        room_uuid,
        active_room_uuid: room_uuid,
        previous_room_uuid: null,
        next_room_uuid: room_uuid,
        admin_user_uuid: null,
        admin_participant_uuid: null,
        reason: skipped ? 'core_returned_skipped' : 'core_returned_ok',
        error_code: result.body.ok ? null : result.body.error,
        error_message: result.body.ok ? null : result.body.error,
      },
    })

    return result
  } catch (error) {
    await debug_event({
      category: 'admin_chat',
      event: 'enter_support_room_failed',
      payload: {
        room_uuid,
        active_room_uuid: room_uuid,
        previous_room_uuid: null,
        next_room_uuid: room_uuid,
        admin_user_uuid: null,
        admin_participant_uuid: null,
        reason: 'core_threw',
        error_code: 'enter_support_room_failed',
        error_message: error instanceof Error ? error.message : String(error),
      },
    })

    throw error
  }
}

export async function leave_support_room(input: {
  room_uuid: string
  staff_participant_uuid: string
  leave_reason: string
  previous_active_room_uuid: string | null
  next_active_room_uuid: string | null
  support_session_key?: string | null
  debug_event_name?: string | null
}) {
  await debug_event({
    category: 'admin_chat',
    event: 'leave_support_room_started',
    payload: {
      room_uuid: input.room_uuid,
      active_room_uuid: null,
      previous_room_uuid: input.previous_active_room_uuid,
      next_room_uuid: input.next_active_room_uuid,
      admin_user_uuid: null,
      admin_participant_uuid: input.staff_participant_uuid,
      leave_reason: input.leave_reason,
      reason: input.leave_reason,
      error_code: null,
      error_message: null,
    },
  })

  if (!input.room_uuid.trim() || !input.staff_participant_uuid.trim()) {
    await debug_event({
      category: 'admin_chat',
      event: 'leave_support_room_skipped',
      payload: {
        room_uuid: input.room_uuid || null,
        active_room_uuid: null,
        previous_room_uuid: input.previous_active_room_uuid,
        next_room_uuid: input.next_active_room_uuid,
        admin_user_uuid: null,
        admin_participant_uuid: input.staff_participant_uuid || null,
        leave_reason: input.leave_reason,
        reason: 'missing_room_or_participant',
        error_code: null,
        error_message: null,
      },
    })

    return
  }

  try {
    await record_admin_support_left_session({
      room_uuid: input.room_uuid,
      staff_participant_uuid: input.staff_participant_uuid,
      leave_reason: input.leave_reason,
      previous_active_room_uuid: input.previous_active_room_uuid,
      next_active_room_uuid: input.next_active_room_uuid,
      support_session_key: input.support_session_key,
    })

    await mark_admin_support_leave({
      room_uuid: input.room_uuid,
      participant_uuid: input.staff_participant_uuid,
      debug_event_name: input.debug_event_name,
    })

    await debug_event({
      category: 'admin_chat',
      event: 'leave_support_room_succeeded',
      payload: {
        room_uuid: input.room_uuid,
        active_room_uuid: null,
        previous_room_uuid: input.previous_active_room_uuid,
        next_room_uuid: input.next_active_room_uuid,
        admin_user_uuid: null,
        admin_participant_uuid: input.staff_participant_uuid,
        leave_reason: input.leave_reason,
        reason: input.leave_reason,
        error_code: null,
        error_message: null,
      },
    })
  } catch (error) {
    await debug_event({
      category: 'admin_chat',
      event: 'leave_support_room_failed',
      payload: {
        room_uuid: input.room_uuid,
        active_room_uuid: null,
        previous_room_uuid: input.previous_active_room_uuid,
        next_room_uuid: input.next_active_room_uuid,
        admin_user_uuid: null,
        admin_participant_uuid: input.staff_participant_uuid,
        leave_reason: input.leave_reason,
        reason: input.leave_reason,
        error_code: 'leave_support_room_failed',
        error_message: error instanceof Error ? error.message : String(error),
      },
    })

    throw error
  }
}
