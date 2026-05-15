import 'server-only'

import {
  handle_admin_reception_room_opened,
  record_admin_support_left_session,
} from '@/lib/chat/action'
import { mark_admin_support_leave } from '@/lib/chat/presence/action'

export async function enter_support_room(request: Request) {
  return handle_admin_reception_room_opened(request)
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
}
