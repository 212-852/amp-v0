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
    link_state: body?.link_state,
  })

  if (
    !context.link_session_uuid &&
    typeof body?.pass_uuid !== 'string' &&
    typeof body?.code !== 'string'
  ) {
    return NextResponse.json(
      { ok: false, error: 'pass_uuid_or_code_required' },
      { status: 400 },
    )
  }

  const payload: Record<string, unknown> = { ...(body ?? {}) }

  if (
    context.link_session_uuid &&
    !payload.pass_uuid &&
    !payload.code &&
    !payload.link_session_uuid
  ) {
    payload.link_session_uuid = context.link_session_uuid
  }

  try {
    const status = await get_auth_link_session_status(payload)

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

