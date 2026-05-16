import type { handoff_memo } from '@/lib/chat/handoff'
import type {
  reception_room,
  reception_room_message,
} from '@/lib/admin/reception/types'

export type admin_reception_room_shell_props = {
  room_uuid: string
  room: reception_room | null
  admin_user_uuid: string
  admin_participant_uuid: string
  customer_display_name: string
  staff_user_uuid: string | null
  staff_tier: string | null
  staff_participant_uuid: string
  staff_display_name: string
  memos: handoff_memo[]
  messages: reception_room_message[]
  load_failed: boolean
}
