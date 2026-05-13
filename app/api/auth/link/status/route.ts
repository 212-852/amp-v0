import { NextResponse } from 'next/server'

import { get_auth_link_session_status } from '@/lib/auth/link/action'
import { normalize_status_context } from '@/lib/auth/link/context'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const context = normalize_status_context({
    link_session_uuid: body?.link_session_uuid,
  })

  if (!context.link_session_uuid) {
    return NextResponse.json(
      { ok: false, error: 'link_session_uuid_required' },
      { status: 400 },
    )
  }

  try {
    const status = await get_auth_link_session_status(
      context.link_session_uuid,
    )

    return NextResponse.json({ ok: true, ...status })
  } catch (error) {
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

