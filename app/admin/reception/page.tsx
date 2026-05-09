import Link from 'next/link'
import type { ReactNode } from 'react'

import { search_reception_rooms } from '@/lib/admin/reception/action'
import { debug_admin_reception } from '@/lib/admin/reception/debug'
import {
  parse_reception_search_filters,
  type reception_search_filters,
} from '@/lib/admin/reception/rules'

import AdminReceptionPageClient from '@/components/admin/reception/page_client'

export const dynamic = 'force-dynamic'

type admin_reception_page_data =
  | {
      ok: true
      initial_filters: reception_search_filters
      initial_rooms: Awaited<ReturnType<typeof search_reception_rooms>>
    }
  | {
      ok: false
    }

function ReceptionPageShell({ children }: { children: ReactNode }) {
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
      {children}
    </div>
  )
}

function ReceptionPageFallback() {
  return (
    <ReceptionPageShell>
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
        チャット一覧を読み込めませんでした
      </div>
    </ReceptionPageShell>
  )
}

async function load_admin_reception_page_data(): Promise<admin_reception_page_data> {
  try {
    const initial_filters: reception_search_filters =
      parse_reception_search_filters({ status_mode: 'concierge' })
    const initial_rooms = await search_reception_rooms(initial_filters)

    return {
      ok: true,
      initial_filters,
      initial_rooms: Array.isArray(initial_rooms) ? initial_rooms : [],
    }
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      data: {
        step: 'admin_reception_page_load',
        error_message: error instanceof Error ? error.message : String(error),
        error_stack: error instanceof Error ? error.stack : null,
      },
    })

    console.error('[admin_reception_page] initial_load_failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    return { ok: false }
  }
}

export default async function AdminReceptionPage() {
  const data = await load_admin_reception_page_data()

  if (!data.ok) {
    return <ReceptionPageFallback />
  }

  return (
    <ReceptionPageShell>
      <AdminReceptionPageClient
        initial_filters={data.initial_filters}
        initial_rooms={data.initial_rooms}
      />
    </ReceptionPageShell>
  )
}
