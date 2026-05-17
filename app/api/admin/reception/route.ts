import { NextResponse } from 'next/server'

import {
  apply_admin_reception_request,
  read_admin_reception,
} from '@/lib/admin/reception/action'
import { resolve_admin_context } from '@/lib/admin/context'
import { is_reception_open } from '@/lib/admin/rules'
import { debug_event } from '@/lib/debug'
import type { reception_request_input } from '@/lib/admin/reception/rules'

function serialize_error(error: unknown) {
  return {
    error_message: error instanceof Error ? error.message : String(error),
    error_code:
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code ?? null
        : null,
  }
}

export async function GET() {
  const context = await resolve_admin_context()

  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    )
  }

  try {
    const record = await read_admin_reception(context.admin_user_uuid)

    return NextResponse.json({
      ok: true,
      admin_user_uuid: context.admin_user_uuid,
      state: record.state,
      is_available: is_reception_open(record.state),
      updated_at: record.updated_at,
    })
  } catch (error) {
    await debug_event({
      category: 'admin_management',
      event: 'admin_reception_load_failed',
      payload: {
        step: 'get',
        admin_user_uuid: context.admin_user_uuid,
        ...serialize_error(error),
      },
    })

    return NextResponse.json(
      { ok: false, error: 'admin_reception_load_failed' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | reception_request_input
      | null

    const context = await resolve_admin_context()

    if (!context.ok) {
      return NextResponse.json(
        { ok: false, error: context.error },
        { status: context.status },
      )
    }

    const result = await apply_admin_reception_request({
      admin_user_uuid: context.admin_user_uuid,
      body,
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status },
      )
    }

    return NextResponse.json({
      ok: true,
      admin_user_uuid: context.admin_user_uuid,
      state: result.record.state,
      is_available: is_reception_open(result.record.state),
      updated_at: result.record.updated_at,
    })
  } catch (error) {
    await debug_event({
      category: 'admin_management',
      event: 'admin_reception_toggle_failed',
      payload: {
        step: 'unexpected',
        ...serialize_error(error),
      },
    })

    return NextResponse.json(
      { ok: false, error: 'admin_reception_toggle_failed' },
      { status: 500 },
    )
  }
}
