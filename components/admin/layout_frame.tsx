'use client'

import AdminHeader from '@/components/admin/header'
import { AdminReceptionProvider } from '@/components/admin/reception/provider'
import AdminShell from '@/components/layout/admin/shell'
import PresenceClient from '@/components/presence/client'

type AdminLayoutFrameProps = {
  admin_user_uuid: string
  display_name: string | null
  image_url: string | null
  role: string | null
  tier: string | null
  children: React.ReactNode
}

export default function AdminLayoutFrame({
  admin_user_uuid,
  display_name,
  image_url,
  role,
  tier,
  children,
}: AdminLayoutFrameProps) {
  return (
    <AdminShell
      display_name={display_name}
      image_url={image_url}
      role={role}
      tier={tier}
    >
      <AdminReceptionProvider admin_user_uuid={admin_user_uuid}>
        <PresenceClient />
        <div className="fixed left-0 right-0 top-0 z-[120] w-screen bg-white">
          <div className="mx-auto w-full max-w-[480px]">
            <AdminHeader
              display_name={display_name}
              image_url={image_url}
              role={role}
              tier={tier}
              user_uuid={admin_user_uuid}
            />
          </div>
        </div>
        <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-6 pt-[calc(env(safe-area-inset-top,0px)+108px)]">
          {children}
        </main>
      </AdminReceptionProvider>
    </AdminShell>
  )
}
