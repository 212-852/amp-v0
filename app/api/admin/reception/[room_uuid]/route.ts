import { NextResponse } from 'next/server'

import { resolve_admin_reception_context } from '@/lib/admin/reception/context'
import { get_reception_room } from '@/lib/admin/reception/room'

type route_context = {
  params: Promise<{ room_uuid: string }>
}

export async function GET(_request: Request, context: route_context) {
  const admin_context = await resolve_admin_reception_context()

  if (!admin_context.ok) {
    return NextResponse.json(
      { ok: false, error: admin_context.error },
      { status: admin_context.status },
    )
  }

  try {
    const { room_uuid } = await context.params
    const room = await get_reception_room(room_uuid)

    if (!room) {
      return NextResponse.json(
        { ok: false, error: 'room_not_found' },
        { status: 404 },
      )
    }

    return NextResponse.json({ ok: true, room })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'room_summary_failed',
        error_message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
