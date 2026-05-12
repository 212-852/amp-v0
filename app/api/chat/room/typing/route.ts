import { NextResponse } from 'next/server'

import { get_session_user } from '@/lib/auth/route'
import { clean_uuid } from '@/lib/db/uuid/payload'
import { resolve_admin_room_typing_banner_lines } from '@/lib/chat/presence/action'

export async function GET(request: Request) {
  const session = await get_session_user()

  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const room_uuid = clean_uuid(url.searchParams.get('room_uuid'))
  const viewer_participant_uuid = clean_uuid(
    url.searchParams.get('viewer_participant_uuid'),
  )

  if (!room_uuid || !viewer_participant_uuid) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 })
  }

  try {
    const lines = await resolve_admin_room_typing_banner_lines({
      room_uuid,
      viewer_participant_uuid,
    })

    return NextResponse.json({ ok: true, lines })
  } catch (error) {
    console.error('[typing_banner] resolve_failed', {
      room_uuid,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { ok: false, error: 'typing_resolve_failed' },
      { status: 500 },
    )
  }
}
