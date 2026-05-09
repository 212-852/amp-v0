import { redirect } from 'next/navigation'

import { require_admin_route_access } from '@/lib/auth/route'

export const dynamic = 'force-dynamic'

export default async function AdminManagementPage() {
  const access = await require_admin_route_access('/admin/management')

  if (access.tier !== 'owner' && access.tier !== 'core') {
    redirect('/admin')
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm font-medium text-neutral-500 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      管理メニュー
    </section>
  )
}
