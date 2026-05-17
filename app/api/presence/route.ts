import { NextResponse } from 'next/server'

import { get_session_user } from '@/lib/auth/route'
import { debug_control } from '@/lib/debug/control'
import { debug_event } from '@/lib/debug'
import { write_presence } from '@/lib/presence/action'
import { resolve_presence_context } from '@/lib/presence/context'
import { decide_presence_write } from '@/lib/presence/rules'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const session = await get_session_user()
  const context = resolve_presence_context({ session, body })

  if (!context.ok) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      skipped_reason: context.error,
    })
  }

  const decision = decide_presence_write(context.context)

  if (
    debug_control.debug_full &&
    typeof body?.detection === 'object' &&
    body.detection !== null
  ) {
    await debug_event({
      category: 'pwa',
      event: 'presence_channel_detected',
      payload: {
        detected_channel:
          typeof (body.detection as { detected_channel?: unknown })
            .detected_channel === 'string'
            ? (body.detection as { detected_channel: string }).detected_channel
            : context.context.channel,
        is_liff: (body.detection as { is_liff?: unknown }).is_liff === true,
        is_pwa: (body.detection as { is_pwa?: unknown }).is_pwa === true,
        display_mode:
          typeof (body.detection as { display_mode?: unknown }).display_mode ===
          'string'
            ? (body.detection as { display_mode: string }).display_mode
            : null,
        navigator_standalone:
          (body.detection as { navigator_standalone?: unknown })
            .navigator_standalone === true,
        has_liff_object:
          (body.detection as { has_liff_object?: unknown }).has_liff_object ===
          true,
        user_agent:
          typeof (body.detection as { user_agent?: unknown }).user_agent ===
          'string'
            ? (body.detection as { user_agent: string }).user_agent
            : null,
      },
    })
  }

  const result = await write_presence(decision)

  if (!result.ok && decision.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'presence_write_failed',
        error_message: result.error,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: result.ok,
    skipped: !decision.ok,
    skipped_reason: decision.ok ? null : decision.skipped_reason,
  })
}
