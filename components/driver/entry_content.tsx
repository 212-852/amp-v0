import DriverEntryView from '@/components/driver/entry_view'
import { get_session_user } from '@/lib/auth/route'
import { resolve_driver_route_subject } from '@/lib/driver/context'
import { has_line_identity, type entry_redirect_reason } from '@/lib/driver/rules'

type DriverEntryContentProps = {
  reason: entry_redirect_reason
}

export default async function DriverEntryContent({
  reason,
}: DriverEntryContentProps) {
  const subject = await resolve_driver_route_subject()
  const session = await get_session_user()
  const line_linked = has_line_identity(subject.identities)

  return (
    <DriverEntryView
      reason={reason}
      line_linked={line_linked}
      user_uuid={subject.user.user_uuid}
      role={subject.user.role}
      tier={session.tier}
    />
  )
}
