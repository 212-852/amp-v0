import { NextResponse } from 'next/server'

import { resolve_admin_reception_context } from '@/lib/admin/reception/context'
import {
  normalize_handoff_memo,
  read_reception_room_memo,
  update_reception_room_memo,
} from '@/lib/admin/reception/room'

type route_context = {
  params: Promise<{ room_uuid: string }>
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
    const memo = await read_reception_room_memo({ room_uuid })

    return NextResponse.json({
      ok: true,
      memo: memo.handoff_memo,
      updated_at: memo.handoff_memo_updated_at,
      updated_by: memo.handoff_memo_updated_by,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'memo_read_failed',
        ...serialize_error(error),
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request, context: route_context) {
  const admin_context = await resolve_admin_reception_context()

  if (!admin_context.ok) {
    return NextResponse.json(
      { ok: false, error: admin_context.error },
      { status: admin_context.status },
    )
  }

  try {
    const { room_uuid } = await context.params
    const body = (await request.json().catch(() => ({}))) as {
      memo?: unknown
    }
    const memo = await update_reception_room_memo({
      room_uuid,
      memo: normalize_handoff_memo(body.memo),
      updated_by: admin_context.admin_user_uuid,
    })

    return NextResponse.json({
      ok: true,
      memo: memo.handoff_memo,
      updated_at: memo.handoff_memo_updated_at,
      updated_by: memo.handoff_memo_updated_by,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'memo_update_failed',
        ...serialize_error(error),
      },
      { status: 500 },
    )
  }
}
