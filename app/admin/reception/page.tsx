import Link from 'next/link'

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
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-500"
        >
          <Link href="/admin" className="transition-colors hover:text-black">
            Home
          </Link>
          <span aria-hidden>{'>'}</span>
          <span className="text-neutral-900">チャット一覧</span>
        </nav>
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold text-black">チャット一覧</h1>
          <span className="text-[12px] text-neutral-500">
            {initial_rooms.length} 件
          </span>
        </div>
      </header>
      <AdminReceptionPageClient
        initial_filters={initial_filters}
        initial_rooms={initial_rooms}
      />
    </div>
  )
}
