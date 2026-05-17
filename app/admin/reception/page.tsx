import AdminReceptionList from '@/components/admin/reception/list'
import { require_admin_route_access } from '@/lib/auth/route'
import type { reception_room_mode } from '@/lib/admin/reception/room'

export const dynamic = 'force-dynamic'

type AdminReceptionPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function parse_mode(value: unknown): reception_room_mode {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'bot' ? 'bot' : 'concierge'
}

export default async function AdminReceptionPage({
  searchParams,
}: AdminReceptionPageProps) {
  await require_admin_route_access('/admin/reception')
  const params = await searchParams
  const selected_mode = parse_mode(params?.mode)

  return <AdminReceptionList mode={selected_mode} load_ok />
}
