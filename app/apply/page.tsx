import DriverApplyForm from '@/components/driver/apply_form'
import { load_apply_page_output } from '@/lib/driver/action'
import { require_apply_route_access } from '@/lib/auth/route'

export const dynamic = 'force-dynamic'

export default async function ApplyPage() {
  const access = await require_apply_route_access()
  const output = await load_apply_page_output(access.user_uuid)

  return <DriverApplyForm initial_application={output.existing_application} />
}
