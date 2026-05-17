'use client'

import AdminReception from '@/components/admin/reception'
import AdminAssistant from '@/components/layout/admin/assistant'
import { use_admin_reception } from '@/components/admin/reception/provider'

type AdminTopProps = {
  display_name: string | null
}

/**
 * Admin home (`/admin`): AI Assistant is always visible; reception list follows
 * `public.receptions.state` via shared provider.
 */
export default function AdminTop({ display_name }: AdminTopProps) {
  const { reception_state } = use_admin_reception()
  const reception_open = reception_state === 'open'

  return (
    <>
      <AdminAssistant display_name={display_name} />

      {reception_open ? <AdminReception /> : null}
    </>
  )
}
