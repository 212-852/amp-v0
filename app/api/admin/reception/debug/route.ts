import { NextResponse } from 'next/server'

import { debug_admin_reception } from '@/lib/admin/reception/debug'

type admin_reception_debug_body = {
  event?: unknown
  payload?: unknown
}

function normalize_payload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {}
  }

  return payload as Record<string, unknown>
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as
    admin_reception_debug_body
  const event = typeof body.event === 'string' ? body.event.trim() : ''

  if (!event) {
    return NextResponse.json(
      { ok: false, error: 'missing_event' },
      { status: 400 },
    )
  }

  await debug_admin_reception({
    event,
    payload: normalize_payload(body.payload),
  })

  return NextResponse.json({ ok: true })
}
