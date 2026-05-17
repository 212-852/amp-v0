import DriverEntryView from '@/components/driver/entry_view'
import { resolve_driver_route_subject } from '@/lib/driver/context'
import { has_line_identity, type entry_redirect_reason } from '@/lib/driver/rules'

type DriverEntryContentProps = {
  reason: entry_redirect_reason
}

export default async function DriverEntryContent({
  reason,
}: DriverEntryContentProps) {
  const subject = await resolve_driver_route_subject()
  const line_linked = has_line_identity(subject.identities)

  return <DriverEntryView reason={reason} line_linked={line_linked} />
}
