import AdminReception from '@/components/admin/reception'
import { AdminRenderProbe } from '@/components/admin/render_probe'
import AdminAssistant from '@/components/layout/admin/assistant'
import {
  list_reception_rooms,
  type reception_room,
} from '@/lib/admin/reception/room'
import { read_admin_reception } from '@/lib/admin/reception/action'
import { require_admin_route_access } from '@/lib/auth/route'

export const dynamic = 'force-dynamic'

async function load_top_rooms(state: 'open' | 'offline'): Promise<reception_room[]> {
  if (state === 'offline') {
    return []
  }

  try {
    return await list_reception_rooms({
      mode: 'concierge',
      limit: 3,
      used_by: 'top',
    })
  } catch (error) {
    console.error('[admin_home] list_reception_rooms_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

async function load_reception_state(
  admin_user_uuid: string,
): Promise<'open' | 'offline'> {
  try {
    const record = await read_admin_reception(admin_user_uuid)
    return record.state
  } catch (error) {
    console.error('[admin_home] read_admin_reception_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return 'offline'
  }
}

export default async function AdminPage() {
  const access = await require_admin_route_access('/admin')
  const state = await load_reception_state(access.user_uuid)
  const rooms = await load_top_rooms(state)

  return (
    <div
      className="flex flex-col gap-3 pb-[calc(200px+env(safe-area-inset-bottom,0px))]"
      data-debug-component="app/admin/page.tsx"
    >
      <AdminRenderProbe file_path="app/admin/page.tsx" />
      <AdminReception rooms={rooms} state={state} />
      <AdminAssistant display_name={access.display_name} />
    </div>
  )
}
