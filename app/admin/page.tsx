import AdminReception from '@/components/admin/reception'
import {
  list_reception_rooms,
  type reception_room,
} from '@/lib/admin/reception/room'

export const dynamic = 'force-dynamic'

async function load_top_rooms(): Promise<reception_room[]> {
  try {
    return await list_reception_rooms({ limit: 3 })
  } catch (error) {
    console.error('[admin_home] list_reception_rooms_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export default async function AdminPage() {
  const rooms = await load_top_rooms()

  return (
    <div className="flex flex-col gap-3">
      <AdminReception rooms={rooms} />
    </div>
  )
}
