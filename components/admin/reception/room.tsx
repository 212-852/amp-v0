import AdminChat from '@/components/admin/chat'
import AdminHandoffMemo from '@/components/admin/memo'
import AdminReceptionActiveSummary from '@/components/admin/reception/active_summary'
import { debug_event } from '@/lib/debug'
import type { handoff_memo } from '@/lib/chat/action'
import type {
  reception_room,
  reception_room_message,
} from '@/lib/admin/reception/room'

type AdminReceptionRoomProps = {
  room_uuid: string
  room: reception_room | null
  customer_display_name: string
  staff_user_uuid: string | null
  staff_tier: string | null
  staff_participant_uuid: string
  staff_display_name: string
  memos: handoff_memo[]
  messages: reception_room_message[]
  load_failed: boolean
}

const component_file = 'components/admin/reception/room.tsx'

export default async function AdminReceptionRoom(props: AdminReceptionRoomProps) {
  const pathname = `/admin/reception/${props.room_uuid}`

  await debug_event({
    category: 'admin_chat',
    event: 'admin_reception_room_rendered',
    payload: {
      room_uuid: props.room_uuid,
      active_room_uuid: props.room_uuid,
      admin_user_uuid: props.staff_user_uuid,
      admin_participant_uuid: props.staff_participant_uuid.trim() || null,
      component_file,
      pathname,
      ignored_reason: null,
      error_code: null,
      error_message: null,
    },
  })

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-neutral-200 px-6 py-4">
        <div className="flex flex-col gap-3">
          <AdminReceptionActiveSummary
            room_uuid={props.room_uuid}
            room={props.room}
            customer_display_name={props.customer_display_name}
            staff_user_uuid={props.staff_user_uuid}
            staff_tier={props.staff_tier}
            staff_participant_uuid={props.staff_participant_uuid}
          />
          <AdminHandoffMemo
            room_uuid={props.room_uuid}
            initial_memos={props.memos}
          />
        </div>
      </div>

      <AdminChat
        key={props.room_uuid}
        messages={props.messages}
        load_failed={props.load_failed}
        room_uuid={props.room_uuid}
        staff_participant_uuid={props.staff_participant_uuid}
        staff_display_name={props.staff_display_name}
        staff_user_uuid={props.staff_user_uuid}
        staff_tier={props.staff_tier}
        room_display_title={props.customer_display_name}
      />
    </section>
  )
}
