import Link from 'next/link'
import { UserRound } from 'lucide-react'

import {
  read_admin_user,
  type admin_user_detail,
} from '@/lib/admin/management/action'
import { require_admin_management_access } from '@/lib/admin/management/context'

export const dynamic = 'force-dynamic'

type AdminManagementDetailPageProps = {
  params: Promise<{ user_uuid: string }>
}

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

async function load_admin(user_uuid: string): Promise<{
  ok: boolean
  admin: admin_user_detail | null
}> {
  try {
    return { ok: true, admin: await read_admin_user(user_uuid) }
  } catch (error) {
    console.error('[admin_management_detail_page] read_admin_user_failed', {
      user_uuid,
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, admin: null }
  }
}

export default async function AdminManagementDetailPage({
  params,
}: AdminManagementDetailPageProps) {
  await require_admin_management_access()
  const { user_uuid } = await params
  const result = await load_admin(user_uuid)
  const admin = result.admin

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
          <Link
            href="/admin/management"
            className="transition-colors hover:text-black"
          >
            運営者管理
          </Link>
          <span aria-hidden>{'>'}</span>
          <span className="truncate text-neutral-900">
            {admin?.display_name ?? '名称未設定'}
          </span>
        </nav>
      </header>

      {!result.ok ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          運営者情報を読み込めませんでした
        </div>
      ) : !admin ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm font-medium text-neutral-500">
          該当する運営者が見つかりません
        </div>
      ) : (
        <>
          <section className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-700"
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
                <span className="text-[14px] font-semibold">
                  {admin.display_name.slice(0, 1)}
                </span>
              ) : (
                <UserRound className="h-5 w-5" strokeWidth={2} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-semibold leading-tight text-black">
                {admin.display_name ?? '名称未設定'}
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-neutral-400">
                {admin.user_uuid}
              </div>
            </div>
          </section>

          <section
            aria-label="運営者プロファイル"
            className="rounded-2xl border border-neutral-200 bg-white"
          >
            <dl className="divide-y divide-neutral-200">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-[12px] font-semibold text-neutral-500">
                  Role
                </dt>
                <dd className="text-[13px] font-medium text-black">
                  {admin.role ?? 'admin'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-[12px] font-semibold text-neutral-500">
                  Tier
                </dt>
                <dd className="text-[13px] font-medium text-black">
                  {admin.tier ?? '未設定'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-[12px] font-semibold text-neutral-500">
                  受付状態
                </dt>
                <dd>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${reception_chip_class(admin.reception_state)}`}
                  >
                    {reception_label(admin.reception_state)}
                  </span>
                </dd>
              </div>
              {admin.created_at ? (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="text-[12px] font-semibold text-neutral-500">
                    登録日時
                  </dt>
                  <dd className="text-[13px] font-medium text-black">
                    {format_time(admin.created_at)}
                  </dd>
                </div>
              ) : null}
              {admin.reception_updated_at ? (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="text-[12px] font-semibold text-neutral-500">
                    受付更新
                  </dt>
                  <dd className="text-[13px] font-medium text-black">
                    {format_time(admin.reception_updated_at)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section
            aria-label="ログイン手段"
            className="rounded-2xl border border-neutral-200 bg-white"
          >
            <header className="border-b border-neutral-200 px-4 py-3 text-[12px] font-semibold text-neutral-500">
              ログイン手段
            </header>
            {admin.identities.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] font-medium text-neutral-500">
                登録されたログイン手段はありません
              </div>
            ) : (
              <ul className="divide-y divide-neutral-200">
                {admin.identities.map((identity) => (
                  <li
                    key={`${identity.provider}:${identity.provider_id ?? ''}`}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <span className="text-[13px] font-medium text-black">
                      {identity.provider}
                    </span>
                    <span className="font-mono text-[11px] text-neutral-400">
                      {identity.provider_id ?? '-'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-label="最近のアクティビティ"
            className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm font-medium text-neutral-500"
          >
            最近のアクティビティは次のステップで実装
          </section>
        </>
      )}
    </div>
  )
}
