import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { UserRound } from 'lucide-react'

import {
  read_admin_user,
  update_profile,
  type admin_user_detail,
} from '@/lib/admin/management/action'
import { require_admin_management_access } from '@/lib/admin/management/context'

export const dynamic = 'force-dynamic'

type AdminManagementDetailPageProps = {
  params: Promise<{ user_uuid: string }>
  searchParams?: Promise<{ saved?: string; error?: string; error_message?: string }>
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
  searchParams,
}: AdminManagementDetailPageProps) {
  await require_admin_management_access()
  const { user_uuid } = await params
  const query = searchParams ? await searchParams : {}
  const result = await load_admin(user_uuid)
  const admin = result.admin
  const is_saved = query.saved === '1'
  const has_error = Boolean(query.error)
  const error_code = query.error ?? null
  const error_message = query.error_message ?? null

  async function save_profile(form_data: FormData) {
    'use server'

    const access = await require_admin_management_access()

    const result = await update_profile({
      user_uuid,
      updated_by_user_uuid: access.admin_user_uuid,
      updated_by_role: access.role,
      updated_by_tier: access.tier,
      source_channel: 'web',
      real_name: String(form_data.get('real_name') ?? ''),
      birth_date: String(form_data.get('birth_date') ?? ''),
      work_name: String(form_data.get('work_name') ?? ''),
    })

    if (!result.ok) {
      const params = new URLSearchParams({ error: result.error })

      if (result.error_message) {
        params.set('error_message', result.error_message)
      }

      redirect(`/admin/management/${user_uuid}?${params.toString()}`)
    }

    revalidatePath('/admin/management')
    revalidatePath(`/admin/management/${user_uuid}`)
    redirect(`/admin/management/${user_uuid}?saved=1`)
  }

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
            運営者一覧
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
              <div className="mt-1 text-[12px] font-medium text-neutral-500">
                {admin.role ?? 'admin'} / {admin.tier ?? '未設定'}
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-neutral-400">
                {admin.user_uuid}
              </div>
            </div>
          </section>

          <form
            action={save_profile}
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h1 className="text-[15px] font-semibold text-black">
                運営者プロフィール
              </h1>
              {is_saved ? (
                <span className="text-[12px] font-semibold text-neutral-500">
                  保存しました
                </span>
              ) : null}
              {has_error ? (
                <span className="text-[12px] font-semibold text-neutral-500">
                  {error_message ??
                    (error_code === 'persist_failed' ||
                    error_code === 'target_load_failed'
                      ? 'Save failed. Check Debug Cat for the Supabase error.'
                      : '入力内容を確認してください')}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-neutral-500">
                  本名
                </span>
                <input
                  name="real_name"
                  defaultValue={admin.profile.real_name ?? ''}
                  maxLength={80}
                  placeholder="本名"
                  className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-[14px] text-black outline-none transition-colors focus:border-black"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-neutral-500">
                  生年月日
                </span>
                <input
                  name="birth_date"
                  type="date"
                  defaultValue={admin.profile.birth_date ?? ''}
                  placeholder="生年月日"
                  className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-[14px] text-black outline-none transition-colors focus:border-black"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-neutral-500">
                  社内表示名
                </span>
                <input
                  name="work_name"
                  defaultValue={admin.profile.work_name ?? ''}
                  maxLength={40}
                  placeholder="社内表示名"
                  className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-[14px] text-black outline-none transition-colors focus:border-black"
                />
              </label>
            </div>

            <button
              type="submit"
              className="mt-4 h-11 w-full rounded-xl bg-black px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              保存
            </button>
          </form>

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
