import { NextResponse } from 'next/server'

import { resolve_admin_context } from '@/lib/admin/context'
import { read_admin_reception } from '@/lib/admin/reception/action'
import {
  list_reception_rooms,
  type reception_room_mode,
} from '@/lib/admin/reception/room'
import { debug_event } from '@/lib/debug'

function parse_mode(value: unknown): reception_room_mode {
  return value === 'bot' ? 'bot' : 'concierge'
}

function serialize_error(error: unknown) {
  return {
    error_message: error instanceof Error ? error.message : String(error),
    error_code:
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code ?? null
        : null,
  }
}

export async function GET(request: Request) {
  const context = await resolve_admin_context()

  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    )
  }

  try {
    const url = new URL(request.url)
    const mode = parse_mode(url.searchParams.get('mode'))
    const reception = await read_admin_reception(context.admin_user_uuid)

    if (reception.state !== 'open') {
      return NextResponse.json({
        ok: true,
        state: reception.state,
        rooms: [],
      })
    }

    const rooms = await list_reception_rooms({ mode, limit: 50 })

    return NextResponse.json({
      ok: true,
      state: reception.state,
      rooms,
    })
  } catch (error) {
    await debug_event({
      category: 'admin_chat',
      event: 'chat_list_refetch_failed',
      payload: {
        step: 'api_admin_reception_rooms',
        admin_user_uuid: context.admin_user_uuid,
        ...serialize_error(error),
      },
    })

    return NextResponse.json(
      { ok: false, error: 'chat_list_refetch_failed' },
      { status: 500 },
    )
  }
}
