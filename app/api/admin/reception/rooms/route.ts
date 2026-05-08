import { NextResponse } from 'next/server'

import { search_reception_rooms } from '@/lib/admin/reception/action'
import { resolve_admin_reception_context } from '@/lib/admin/reception/context'
import { debug_admin_reception } from '@/lib/admin/reception/debug'
import { parse_reception_search_filters } from '@/lib/admin/reception/rules'

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
    const filters = parse_reception_search_filters(url.searchParams)
    const rooms = await search_reception_rooms(filters)

    return NextResponse.json({
      ok: true,
      filters,
      rooms,
    })
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
      payload: {
        step: 'list_rooms',
        admin_user_uuid: context.admin_user_uuid,
        ...serialize_error(error),
      },
    })

    return NextResponse.json(
      { ok: false, error: 'admin_reception_failed' },
      { status: 500 },
    )
  }
}
