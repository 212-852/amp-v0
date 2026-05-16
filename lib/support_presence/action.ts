import 'server-only'

import {
  handle_admin_reception_room_opened,
  record_admin_support_left_session,
} from '@/lib/chat/action'
import { mark_admin_support_leave } from '@/lib/chat/presence/action'
import { debug_event } from '@/lib/debug'
import { clean_uuid } from '@/lib/db/uuid/payload'

function clean_text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function serialize_unknown_error(error: unknown) {
  const fields = {
    error_code: null as string | null,
    error_message: null as string | null,
    error_details: null as string | null,
    error_hint: null as string | null,
    error_json: null as string | null,
  }

  if (!error) {
    return fields
  }

  if (error instanceof Error) {
    fields.error_code = error.name
    fields.error_message = error.message
    try {
      fields.error_json = JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
    } catch {
      fields.error_json = null
    }

    return fields
  }

  if (typeof error === 'object') {
    const o = error as Record<string, unknown>
    fields.error_code =
      typeof o.code === 'string' ? o.code : o.code != null ? String(o.code) : null
    fields.error_message =
      typeof o.message === 'string'
        ? o.message
        : o.message != null
          ? String(o.message)
          : String(error)
    const d = o.details
    fields.error_details =
      typeof d === 'string'
        ? d
        : d !== undefined && d !== null
          ? JSON.stringify(d)
          : null
    fields.error_hint =
      typeof o.hint === 'string' ? o.hint : o.hint != null ? String(o.hint) : null
    try {
      fields.error_json = JSON.stringify(error)
    } catch {
      fields.error_json = JSON.stringify({ message: fields.error_message })
    }

    return fields
  }

  fields.error_message = String(error)
  try {
    fields.error_json = JSON.stringify({ value: error })
  } catch {
    fields.error_json = null
  }

  return fields
}

export async function enter_support_room(request: Request) {
  const raw = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  const room_uuid = clean_text(raw?.room_uuid)
  const request_admin_user_uuid = clean_uuid(
    typeof raw?.admin_user_uuid === 'string' ? raw.admin_user_uuid : null,
  )
  const request_admin_participant_uuid = clean_uuid(
    typeof raw?.admin_participant_uuid === 'string'
      ? raw.admin_participant_uuid
      : null,
  )
  const trigger_source =
    typeof raw?.trigger_source === 'string' && raw.trigger_source.trim()
      ? raw.trigger_source.trim()
      : null

  await debug_event({
    category: 'admin_chat',
    event: 'enter_support_room_started',
    payload: {
      room_uuid,
      active_room_uuid: room_uuid,
      previous_room_uuid: null,
      next_room_uuid: room_uuid,
      admin_user_uuid: request_admin_user_uuid,
      admin_participant_uuid: request_admin_participant_uuid,
      reason: 'api_reception_open',
      trigger_source,
      error_code: null,
      error_message: null,
    },
  })

  try {
    const result = await handle_admin_reception_room_opened({
      room_uuid: room_uuid ?? null,
      admin_user_uuid: request_admin_user_uuid,
      admin_participant_uuid: request_admin_participant_uuid,
      trigger_source,
    })
    const skipped = result.body.ok === true && result.body.skipped === true

    await debug_event({
      category: 'admin_chat',
      event: skipped ? 'enter_support_room_skipped' : 'enter_support_room_succeeded',
      payload: {
        room_uuid,
        active_room_uuid: room_uuid,
        previous_room_uuid: null,
        next_room_uuid: room_uuid,
        admin_user_uuid: request_admin_user_uuid,
        admin_participant_uuid: request_admin_participant_uuid,
        trigger_source,
        reason: skipped ? 'core_returned_skipped' : 'core_returned_ok',
        error_code: result.body.ok ? null : result.body.error,
        error_message: result.body.ok ? null : result.body.error,
      },
    })

    return result
  } catch (error) {
    const ser = serialize_unknown_error(error)

    await debug_event({
      category: 'admin_chat',
      event: 'enter_support_room_failed',
      payload: {
        room_uuid,
        active_room_uuid: room_uuid,
        previous_room_uuid: null,
        next_room_uuid: room_uuid,
        admin_user_uuid: request_admin_user_uuid,
        admin_participant_uuid: request_admin_participant_uuid,
        reason: 'core_threw',
        error_code: ser.error_code ?? 'enter_support_room_failed',
        error_message: ser.error_message,
        error_details: ser.error_details,
        error_hint: ser.error_hint,
        error_json: ser.error_json,
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
}): Promise<import('@/lib/chat/action').record_admin_support_left_result> {
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

    return { ok: false }
  }

  try {
    const left = await record_admin_support_left_session({
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

    return left
  } catch (error) {
    const ser = serialize_unknown_error(error)

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
        error_code: ser.error_code ?? 'leave_support_room_failed',
        error_message: ser.error_message,
        error_details: ser.error_details,
        error_hint: ser.error_hint,
        error_json: ser.error_json,
      },
    })

    throw error
  }
}
