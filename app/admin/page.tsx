import AdminTop from '@/components/admin/top'
import { require_admin_route_access } from '@/lib/auth/route'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const access = await require_admin_route_access('/admin')

  return (
    <div className="flex flex-col gap-3 pb-[calc(200px+env(safe-area-inset-bottom,0px))]">
      <AdminTop display_name={access.display_name} />
    </div>
  )
}
