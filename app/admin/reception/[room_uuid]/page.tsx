import AdminReceptionLive from '@/components/admin/reception/live'
import { require_admin_route_access } from '@/lib/auth/route'
import { debug_event } from '@/lib/debug'
import { read_reception_room } from '@/lib/admin/reception/room'
import { resolve_admin_reception_send_context } from '@/lib/chat/room'
import { mark_reception_room_read_for_admin } from '@/lib/chat/room/admin_unread'

export const dynamic = 'force-dynamic'

type AdminReceptionRoomPageProps = {
  params: Promise<{ room_uuid: string }>
}

function to_client_json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export default async function AdminReceptionRoomPage({
  params,
}: AdminReceptionRoomPageProps) {
  const { room_uuid } = await params
  const access = await require_admin_route_access('/admin/reception')
  await mark_reception_room_read_for_admin({
    room_uuid,
    actor_admin_user_uuid: access.user_uuid,
  })
  const send_context = await resolve_admin_reception_send_context({
    room_uuid,
    staff_user_uuid: access.user_uuid,
  })
  const staff_participant_uuid = send_context.ok
    ? send_context.data.staff_participant_uuid
    : ''
  const pathname = `/admin/reception/${room_uuid}`
  const admin_user_uuid = access.user_uuid
  const admin_participant_uuid = staff_participant_uuid.trim()

  await debug_event({
    category: 'admin_chat',
    event: 'admin_reception_page_rendered',
    payload: {
      room_uuid,
      active_room_uuid: room_uuid,
      admin_user_uuid,
      admin_participant_uuid: admin_participant_uuid || null,
      component_file: 'app/admin/reception/[room_uuid]/page.tsx',
      pathname,
      ignored_reason: null,
      error_code: null,
      error_message: null,
    },
  })

  const room_result = await read_reception_room({ room_uuid }).catch(() => null)
  const room = room_result ? to_client_json(room_result) : null

  return (
    <AdminReceptionLive
      room_uuid={room?.room_uuid ?? room_uuid}
      admin_user_uuid={admin_user_uuid}
      admin_participant_uuid={admin_participant_uuid}
    />
  )
}
