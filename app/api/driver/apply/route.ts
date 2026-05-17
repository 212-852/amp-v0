import { NextResponse } from 'next/server'

import { require_apply_route_access } from '@/lib/auth/route'
import { submit_driver_application } from '@/lib/driver/action'
import { normalize_driver_apply_request } from '@/lib/driver/context'

export async function POST(request: Request) {
  const access = await require_apply_route_access()
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  const normalized = normalize_driver_apply_request({
    body,
    user_uuid: access.user_uuid,
  })

  if (!normalized.ok) {
    return NextResponse.json(
      { ok: false, error: normalized.error },
      { status: normalized.error === 'session_missing' ? 401 : 400 },
    )
  }

  const result = await submit_driver_application({
    user_uuid: normalized.user_uuid,
    value: normalized.input,
  })

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    application: result.record,
  })
}
