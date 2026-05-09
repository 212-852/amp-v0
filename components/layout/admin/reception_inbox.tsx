import { list_top_reception_rooms } from '@/lib/admin/reception/action'
import type { reception_room_summary } from '@/lib/admin/reception/rules'

import AdminReceptionInboxClient from './reception_inbox_client'

const MAX_ITEMS = 3

async function load_inbox_rooms(): Promise<reception_room_summary[]> {
  try {
    return await list_top_reception_rooms({ limit: MAX_ITEMS })
  } catch (error) {
    console.error('[admin_reception_inbox] load_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export default async function AdminReceptionInbox() {
  const rooms = await load_inbox_rooms()

  return <AdminReceptionInboxClient initial_rooms={rooms} />
}
