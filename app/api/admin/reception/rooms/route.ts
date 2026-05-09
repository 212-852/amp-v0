import { NextResponse } from 'next/server'

import { search_reception_rooms } from '@/lib/admin/reception/action'
import { resolve_admin_reception_context } from '@/lib/admin/reception/context'
import { debug_admin_reception } from '@/lib/admin/reception/debug'
import { parse_reception_search_filters } from '@/lib/admin/reception/rules'

function pick(error_obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = error_obj[key]

    if (value !== undefined && value !== null) {
      return value
    }
  }

  return null
}

function serialize_error(error: unknown) {
  if (!error || typeof error !== 'object') {
    return {
      query: null,
      error_code: null,
      error_message: error instanceof Error ? error.message : String(error),
      error_details: null,
      error_hint: null,
    }
  }

  const obj = error as Record<string, unknown>

  return {
    query: typeof obj.query === 'string' ? obj.query : null,
    error_code: pick(obj, 'error_code', 'code'),
    error_message:
      pick(obj, 'error_message', 'message') ??
      (error instanceof Error ? error.message : null),
    error_details: pick(obj, 'error_details', 'details'),
    error_hint: pick(obj, 'error_hint', 'hint'),
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
