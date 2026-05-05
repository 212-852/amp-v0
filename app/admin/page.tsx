import { redirect } from 'next/navigation'

import AdminShell from '@/components/layout/admin/shell'
import { resolve_admin_route_access } from '@/lib/auth/route'

const bypass_admin_guard = true

export default async function AdminPage() {
  const access = await resolve_admin_route_access()

  if (!bypass_admin_guard && !access.allowed) {
    redirect('/')
  }

  const display_name = access.allowed ? access.display_name : null

  return (
    <AdminShell display_name={display_name}>
      <div aria-hidden="true" />
    </AdminShell>
  )
}
