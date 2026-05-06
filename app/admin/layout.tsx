import AdminShell from '@/components/layout/admin/shell'
import { require_admin_route_access } from '@/lib/auth/route'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const access = await require_admin_route_access('/admin')

  return (
    <AdminShell display_name={access.display_name} image_url={access.image_url}>
      {children}
    </AdminShell>
  )
}
