import 'server-only'

import { resolve_admin_reception_send_context } from '@/lib/chat/room'

export {
  list_reception_room_messages,
  read_reception_room,
  type reception_room,
  type reception_room_message,
} from './room'

export async function load_admin_reception_participant_uuid(input: {
  room_uuid: string
  staff_user_uuid: string
}): Promise<string> {
  const send_context = await resolve_admin_reception_send_context({
    room_uuid: input.room_uuid,
    staff_user_uuid: input.staff_user_uuid,
  })

  return send_context.ok ? send_context.data.staff_participant_uuid : ''
}
