import Link from 'next/link'

import { search_reception_rooms } from '@/lib/admin/reception/action'
import {
  parse_reception_search_filters,
  type reception_search_filters,
} from '@/lib/admin/reception/rules'

import AdminReceptionPageClient from '@/components/admin/reception/page_client'

const initial_filters: reception_search_filters = parse_reception_search_filters(
  { status_mode: 'concierge' },
)

export const dynamic = 'force-dynamic'

export default async function AdminReceptionPage() {
  const initial_result = await search_reception_rooms(initial_filters)
    .then((rooms) => ({
      ok: true,
      rooms: Array.isArray(rooms) ? rooms : [],
    }))
    .catch((error) => {
      console.error('[admin_reception_page] initial_load_failed', {
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        ok: false,
        rooms: [],
      }
    })

  return (
    <div className="flex flex-col gap-4">
      <header>
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
      </header>
      {initial_result.ok ? (
        <AdminReceptionPageClient
          initial_filters={initial_filters}
          initial_rooms={initial_result.rooms}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          チャット一覧を読み込めませんでした
        </div>
      )}
    </div>
  )
}
