import { NextResponse } from 'next/server'

import { get_auth_link_session_status } from '@/lib/auth/link/action'
import { debug_event } from '@/lib/debug'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  try {
    const status = await get_auth_link_session_status(body)

    if (status.status === 'failed' && !status.pass_uuid && !status.visitor_uuid) {
      await debug_event({
        category: 'pwa',
        event: 'pwa_line_link_poll_failed',
        payload: {
          phase: 'pwa_link_status_api',
          reason: 'pass_not_found',
        },
      })
    }

    return NextResponse.json({ ok: true, ...status })
  } catch (error) {
    await debug_event({
      category: 'pwa',
      event: 'pwa_line_link_poll_failed',
      payload: {
        phase: 'pwa_link_status_api',
        error_message: error instanceof Error ? error.message : String(error),
      },
    })

    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        error: error instanceof Error ? error.message : 'status_failed',
      },
      { status: 500 },
    )
  }
}
