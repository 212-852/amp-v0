import { NextResponse } from 'next/server'

import { list_reception_rooms } from '@/lib/admin/reception/action'
import { resolve_admin_reception_context } from '@/lib/admin/reception/context'
import { debug_admin_reception } from '@/lib/admin/reception/debug'
import { normalize_list_reception_rooms_input } from '@/lib/admin/reception/rules'

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
  const context = await resolve_admin_reception_context()

  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    )
  }

  try {
    const url = new URL(request.url)
    const input = normalize_list_reception_rooms_input(url.searchParams)
    const result = await list_reception_rooms(input)

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: 'list_failed', cards: [] },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      cards: result.cards,
      input,
    })
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      payload: {
        step: 'list_rooms_route',
        admin_user_uuid: context.admin_user_uuid,
        ...serialize_error(error),
      },
    })

    return NextResponse.json(
      { ok: false, error: 'unexpected', cards: [] },
      { status: 500 },
    )
  }
}
