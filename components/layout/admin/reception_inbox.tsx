import { search_reception_rooms } from '@/lib/admin/reception/action'
import type {
  reception_room_summary,
  reception_search_filters,
} from '@/lib/admin/reception/rules'

import AdminReceptionInboxClient from './reception_inbox_client'

const MAX_ITEMS = 3
const mini_filters: reception_search_filters = {
  keyword: null,
  status_mode: 'concierge',
  role: null,
  has_typing: false,
  pending_only: true,
}

async function load_inbox_rooms(): Promise<reception_room_summary[]> {
  try {
    const rooms = await search_reception_rooms(mini_filters)

    return rooms.slice(0, MAX_ITEMS)
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
