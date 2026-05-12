import 'server-only'

import {
  normalize_handoff_memo,
  update_reception_room_memo,
  type reception_room_memo,
} from '@/lib/admin/reception/room'

export type reception_room_memo_request_input = {
  memo?: unknown
}

export async function apply_reception_room_memo_request({
  room_uuid,
  body,
  updated_by,
}: {
  room_uuid: string
  body: reception_room_memo_request_input | null | undefined
  updated_by: string
}): Promise<reception_room_memo> {
  return update_reception_room_memo({
    room_uuid,
    memo: normalize_handoff_memo(body?.memo),
    updated_by,
  })
}
