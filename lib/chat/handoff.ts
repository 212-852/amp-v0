import type { chat_channel } from './room'

export type handoff_memo = {
  memo_uuid: string
  room_uuid: string
  body: string
  saved_by_participant_uuid: string | null
  saved_by_user_uuid: string | null
  saved_by_name: string | null
  saved_by_role: string | null
  source_channel: chat_channel
  created_at: string
}
