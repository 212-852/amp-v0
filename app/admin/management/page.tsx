import Link from 'next/link'

import AdminAvailabilityList from '@/components/admin/availability/list'
import {
  list_available_admin_users,
  type admin_user_summary,
} from '@/lib/admin/management/action'
import { require_admin_management_access } from '@/lib/admin/management/context'

export const dynamic = 'force-dynamic'

async function load_admins(): Promise<{
  ok: boolean
  admins: admin_user_summary[]
}> {
  try {
    return { ok: true, admins: await list_available_admin_users() }
  } catch (error) {
    console.error('[admin_management_page] list_admin_users_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, admins: [] }
  }
}

export default async function AdminManagementPage() {
  await require_admin_management_access()
  const result = await load_admins()
  const admins = result.admins

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
          <span className="text-neutral-900">運営者一覧</span>
        </nav>
        <h1 className="mt-2 text-[18px] font-semibold leading-tight text-black">
          運営者一覧
        </h1>
      </header>

      {!result.ok ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          運営者一覧を読み込めませんでした
        </div>
      ) : admins.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          受付中の運営者はいません
        </div>
      ) : (
        <AdminAvailabilityList initial_admins={admins} />
      )}
    </div>
  )
}
