import AdminLayoutFrame from '@/components/admin/layout_frame'
import { read_admin_display_name } from '@/lib/admin/management/action'
import { require_admin_route_access } from '@/lib/auth/route'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const access = await require_admin_route_access('/admin')
  const display_name =
    (await read_admin_display_name(access.user_uuid)) ?? access.display_name

  return (
    <AdminLayoutFrame
      admin_user_uuid={access.user_uuid}
      display_name={display_name}
      image_url={access.image_url}
      role={access.role}
      tier={access.tier}
    >
      {children}
    </AdminLayoutFrame>
  )
}
