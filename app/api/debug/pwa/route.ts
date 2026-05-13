import { NextResponse } from 'next/server'

import { debug_event } from '@/lib/debug'

type pwa_debug_body = {
  event?: unknown
  user_uuid?: unknown
  participant_uuid?: unknown
  role?: unknown
  tier?: unknown
  source_channel?: unknown
  room_uuid?: unknown
  message_uuid?: unknown
  notification_route?: unknown
  has_push_subscription?: unknown
  has_line_identity?: unknown
  has_beforeinstallprompt?: unknown
  is_standalone?: unknown
  manifest_available?: unknown
  service_worker_registered?: unknown
  user_agent?: unknown
  app_visibility_state?: unknown
  error_code?: unknown
  error_message?: unknown
  phase?: unknown
}

function string_or_null(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | pwa_debug_body
    | null
  const event = string_or_null(body?.event)

  if (!event) {
    return NextResponse.json(
      { ok: false, error: 'missing_debug_event' },
      { status: 400 },
    )
  }

  await debug_event({
    category: 'pwa',
    event,
    payload: {
      user_uuid: string_or_null(body?.user_uuid),
      participant_uuid: string_or_null(body?.participant_uuid),
      role: string_or_null(body?.role),
      tier: string_or_null(body?.tier),
      source_channel: string_or_null(body?.source_channel),
      room_uuid: string_or_null(body?.room_uuid),
      message_uuid: string_or_null(body?.message_uuid),
      notification_route: string_or_null(body?.notification_route),
      has_push_subscription:
        typeof body?.has_push_subscription === 'boolean'
          ? body.has_push_subscription
          : null,
      has_line_identity:
        typeof body?.has_line_identity === 'boolean'
          ? body.has_line_identity
          : null,
      has_beforeinstallprompt:
        typeof body?.has_beforeinstallprompt === 'boolean'
          ? body.has_beforeinstallprompt
          : null,
      is_standalone:
        typeof body?.is_standalone === 'boolean'
          ? body.is_standalone
          : null,
      manifest_available:
        typeof body?.manifest_available === 'boolean'
          ? body.manifest_available
          : null,
      service_worker_registered:
        typeof body?.service_worker_registered === 'boolean'
          ? body.service_worker_registered
          : null,
      user_agent: string_or_null(body?.user_agent),
      app_visibility_state: string_or_null(body?.app_visibility_state),
      error_code: string_or_null(body?.error_code),
      error_message: string_or_null(body?.error_message),
      phase: string_or_null(body?.phase),
    },
  })

  return NextResponse.json({ ok: true })
}
