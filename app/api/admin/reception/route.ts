import { NextResponse } from 'next/server'

import {
  apply_admin_availability_request,
  read_admin_availability,
  state_from_availability_record,
} from '@/lib/admin/action'
import { resolve_admin_context } from '@/lib/admin/context'
import { debug_event } from '@/lib/debug'
import type { admin_availability_request_input } from '@/lib/admin/rules'

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
    const record = await read_admin_availability(context.admin_user_uuid)
    const state = state_from_availability_record(record)

    return NextResponse.json({
      ok: true,
      admin_user_uuid: context.admin_user_uuid,
      state,
      is_available: record.is_available,
      updated_at: record.updated_at,
    })
  } catch (error) {
    await debug_event({
      category: 'admin_management',
      event: 'admin_availability_toggle_failed',
      payload: {
        step: 'get',
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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | admin_availability_request_input
      | null

    const context = await resolve_admin_context()

    if (!context.ok) {
      return NextResponse.json(
        { ok: false, error: context.error },
        { status: context.status },
      )
    }

    const result = await apply_admin_availability_request({
      admin_user_uuid: context.admin_user_uuid,
      body,
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status },
      )
    }

    const state = state_from_availability_record(result.record)

    return NextResponse.json({
      ok: true,
      admin_user_uuid: context.admin_user_uuid,
      state,
      is_available: result.record.is_available,
      updated_at: result.record.updated_at,
    })
  } catch (error) {
    await debug_event({
      category: 'admin_management',
      event: 'admin_availability_toggle_failed',
      payload: {
        step: 'unexpected',
        ...serialize_error(error),
      },
    })

    return NextResponse.json(
      { ok: false, error: 'admin_reception_failed' },
      { status: 500 },
    )
  }
}
