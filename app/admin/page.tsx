import { redirect } from 'next/navigation'

import AdminShell from '@/components/layout/admin/shell'
import { resolve_admin_route_access } from '@/lib/auth/route'

export default async function AdminPage() {
  const access = await resolve_admin_route_access()

  if (!access.allowed) {
    redirect('/')
  }

  return (
    <AdminShell display_name={access.display_name}>
      <div aria-hidden="true" />
    </AdminShell>
  )
}
