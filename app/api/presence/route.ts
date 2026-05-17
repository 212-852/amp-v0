import { NextResponse } from 'next/server'

import { get_session_user } from '@/lib/auth/route'
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
