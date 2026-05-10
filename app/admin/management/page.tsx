import Link from 'next/link'
import { UserRound } from 'lucide-react'

import {
  list_admin_users,
  type admin_user_summary,
} from '@/lib/admin/management/action'
import { require_admin_management_access } from '@/lib/admin/management/context'

export const dynamic = 'force-dynamic'

function format_time(iso: string | null): string {
  if (!iso) {
    return ''
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function reception_label(state: 'open' | 'offline' | null): string {
  if (state === 'open') {
    return '受付中'
  }

  if (state === 'offline') {
    return '受付停止'
  }

  return '未設定'
}

function reception_chip_class(state: 'open' | 'offline' | null): string {
  if (state === 'open') {
    return 'border-black bg-black text-white'
  }

  if (state === 'offline') {
    return 'border-neutral-300 bg-neutral-100 text-neutral-600'
  }

  return 'border-dashed border-neutral-300 bg-white text-neutral-500'
}

async function load_admins(): Promise<{
  ok: boolean
  admins: admin_user_summary[]
}> {
  try {
    return { ok: true, admins: await list_admin_users() }
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
          運営者はまだ登録されていません
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {admins.map((admin) => (
            <li key={admin.user_uuid}>
              <Link
                href={`/admin/management/${admin.user_uuid}`}
                className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-700"
                  aria-hidden
                >
                  {admin.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={admin.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : admin.display_name ? (
                    <span className="text-[12px] font-semibold">
                      {admin.display_name.slice(0, 1)}
                    </span>
                  ) : (
                    <UserRound className="h-4 w-4" strokeWidth={2} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold leading-tight text-black">
                      {admin.display_name ?? '名称未設定'}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${reception_chip_class(admin.reception_state)}`}
                    >
                      {reception_label(admin.reception_state)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium leading-none text-neutral-500">
                    <span>{admin.role ?? 'admin'}</span>
                    <span aria-hidden>{'/'}</span>
                    <span>{admin.tier ?? '未設定'}</span>
                    {admin.created_at ? (
                      <>
                        <span aria-hidden>{'/'}</span>
                        <span>{format_time(admin.created_at)}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
