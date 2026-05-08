import AdminAssistant from '@/components/layout/admin/assistant'
import AdminHeader from '@/components/layout/admin/header'
import AdminReceptionInbox from '@/components/layout/admin/reception_inbox'
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
      <div className="fixed left-0 right-0 top-0 z-[120] w-screen bg-white">
        <div className="mx-auto w-full max-w-[480px]">
          <AdminHeader
            display_name={access.display_name}
            image_url={access.image_url}
            role={access.role}
            tier={access.tier}
          />
        </div>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto px-6 pt-[calc(env(safe-area-inset-top,0px)+108px)] pb-[calc(200px+env(safe-area-inset-bottom,0px))]">
        <div className="mb-4">
          <AdminReceptionInbox />
        </div>
        {children}
      </main>
      <AdminAssistant display_name={access.display_name} />
    </AdminShell>
  )
}
