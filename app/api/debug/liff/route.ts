import { NextResponse } from 'next/server'

import { control } from '@/lib/config/control'
import { debug_event } from '@/lib/debug'

type liff_debug_body = {
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
  const body = (await request.json().catch(() => ({}))) as liff_debug_body
  const event = typeof body.event === 'string' ? body.event.trim() : ''

  if (!event) {
    return NextResponse.json(
      { ok: false, error: 'Missing debug event' },
      { status: 400 },
    )
  }

  if (event === 'liff_auth_failed' || control.debug.liff_auth) {
    await debug_event({
      category: 'liff',
      event,
      payload: normalize_payload(body.payload),
    })
  }

  return NextResponse.json({ ok: true })
}
