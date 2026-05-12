import 'server-only'

import { read_admin_display_name } from '@/lib/admin/management/action'
import { create_handoff_memo } from '@/lib/chat/action'

export type reception_room_memo_request_input = {
  memo?: unknown
}

export async function apply_reception_room_memo_request({
  room_uuid,
  body,
  updated_by,
  saved_by_role,
  saved_by_tier,
}: {
  room_uuid: string
  body: reception_room_memo_request_input | null | undefined
  updated_by: string
  saved_by_role: string | null
  saved_by_tier: string | null
}) {
  const saved_by_name = await read_admin_display_name(updated_by)

  return create_handoff_memo({
    room_uuid,
    body: body?.memo,
    saved_by_user_uuid: updated_by,
    saved_by_name,
    saved_by_role,
    saved_by_tier,
    source_channel: 'web',
  })
}
