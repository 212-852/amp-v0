import { NextResponse } from 'next/server'

import { debug_event } from '@/lib/debug'

const allowed_events = new Set([
  'driver_entry_cta_clicked',
  'driver_apply_access_checked',
  'line_link_redirect_resolved',
  'line_link_failed',
])

function string_or_null(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function boolean_or_null(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const event = string_or_null(body?.event)

  if (!event || !allowed_events.has(event)) {
    return NextResponse.json(
      { ok: false, error: 'invalid_driver_debug_event' },
      { status: 400 },
    )
  }

  await debug_event({
    category: 'driver_link',
    event,
    payload: {
      user_uuid: string_or_null(body?.user_uuid),
      role: string_or_null(body?.role),
      tier: string_or_null(body?.tier),
      has_line_identity: boolean_or_null(body?.has_line_identity),
      return_path: string_or_null(body?.return_path),
      next_url: string_or_null(body?.next_url),
      allowed: boolean_or_null(body?.allowed),
      redirect_to: string_or_null(body?.redirect_to),
      reason: string_or_null(body?.reason),
      role_route: string_or_null(body?.role_route),
      selected_redirect: string_or_null(body?.selected_redirect),
      redirect_reason: string_or_null(body?.redirect_reason),
      error_code: string_or_null(body?.error_code),
      error_message: string_or_null(body?.error_message),
    },
  })

  return NextResponse.json({ ok: true })
}
