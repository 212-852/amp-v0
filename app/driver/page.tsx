import { require_driver_route_access } from '@/lib/auth/route'

export const dynamic = 'force-dynamic'

const content = {
  title: 'ドライバーマイページ',
  description: '登録済みドライバー向けのマイページです。',
} as const

export default async function DriverPage() {
  const access = await require_driver_route_access()

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Driver
        </p>
        <h1 className="text-2xl font-semibold leading-tight text-black">
          {content.title}
        </h1>
        <p className="text-sm text-neutral-600">{content.description}</p>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="font-medium text-neutral-500">表示名</dt>
            <dd className="font-semibold text-black">
              {access.display_name ?? 'Driver'}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="font-medium text-neutral-500">ロール</dt>
            <dd className="font-semibold text-black">{access.role}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
