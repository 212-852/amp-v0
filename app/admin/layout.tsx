import AdminAssistant from '@/components/layout/admin/assistant'
import AdminHeader from '@/components/layout/admin/header'
import AdminShell from '@/components/layout/admin/shell'
import { require_admin_route_access } from '@/lib/auth/route'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const access = await require_admin_route_access('/admin')

  return (
    <AdminShell
      display_name={access.display_name}
      image_url={access.image_url}
      role={access.role}
      tier={access.tier}
    >
      <AdminHeader
        display_name={access.display_name}
        image_url={access.image_url}
        role={access.role}
        tier={access.tier}
      />
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6 pb-[calc(200px+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
      <AdminAssistant display_name={access.display_name} />
    </AdminShell>
  )
}
