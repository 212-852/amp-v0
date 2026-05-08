import { search_reception_rooms } from '@/lib/admin/reception/action'
import {
  parse_reception_search_filters,
  type reception_search_filters,
} from '@/lib/admin/reception/rules'

import AdminReceptionPageClient from '@/components/admin/reception/page_client'

const initial_filters: reception_search_filters = parse_reception_search_filters(
  null,
)

export const dynamic = 'force-dynamic'

export default async function AdminReceptionPage() {
  let initial_rooms = await search_reception_rooms(initial_filters).catch(
    (error) => {
      console.error('[admin_reception_page] initial_load_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    },
  )

  if (!Array.isArray(initial_rooms)) {
    initial_rooms = []
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h1 className="text-base font-semibold text-black">受付一覧</h1>
        <span className="text-[12px] text-neutral-500">
          {initial_rooms.length} 件
        </span>
      </header>
      <AdminReceptionPageClient
        initial_filters={initial_filters}
        initial_rooms={initial_rooms}
      />
    </div>
  )
}
