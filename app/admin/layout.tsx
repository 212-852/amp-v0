import AdminHeader from '@/components/admin/header'
import AdminShell from '@/components/layout/admin/shell'
import PresenceClient from '@/components/presence/client'
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
    <AdminShell
      display_name={display_name}
      image_url={access.image_url}
      role={access.role}
      tier={access.tier}
    >
      <PresenceClient />
      <div className="fixed left-0 right-0 top-0 z-[120] w-screen bg-white">
        <div className="mx-auto w-full max-w-[480px]">
          <AdminHeader
            display_name={display_name}
            image_url={access.image_url}
            role={access.role}
            tier={access.tier}
            user_uuid={access.user_uuid}
          />
        </div>
      </div>
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-6 pt-[calc(env(safe-area-inset-top,0px)+108px)]">
        {children}
      </main>
    </AdminShell>
  )
}
