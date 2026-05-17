import 'server-only'

import { debug_event } from '@/lib/debug'

export async function driver_link_debug_event(input: {
  event:
    | 'driver_entry_cta_clicked'
    | 'driver_apply_access_checked'
    | 'line_link_redirect_resolved'
    | 'line_link_failed'
  payload: Record<string, unknown>
}) {
  await debug_event({
    category: 'driver_link',
    event: input.event,
    payload: input.payload,
  })
}
