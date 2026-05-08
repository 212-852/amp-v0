import { NextResponse } from 'next/server'

import {
  apply_admin_reception_request,
  read_admin_reception,
} from '@/lib/admin/reception/action'
import { resolve_admin_reception_context } from '@/lib/admin/reception/context'
import { debug_admin_reception } from '@/lib/admin/reception/debug'
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
  const context = await resolve_admin_reception_context()

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
      updated_at: record.updated_at,
    })
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
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
  let body: reception_request_input | null = null

  try {
    body = (await request.json().catch(() => null)) as
      | reception_request_input
      | null

    await debug_admin_reception({
      event: 'admin_reception_api_entered',
      payload: {
        method: request.method,
        body,
      },
    })

    const context = await resolve_admin_reception_context()

    if (!context.ok) {
      await debug_admin_reception({
        event: 'admin_reception_failed',
        payload: {
          step: 'session',
          error_message: context.error,
          error_code: context.status,
        },
      })

      return NextResponse.json(
        { ok: false, error: context.error },
        { status: context.status },
      )
    }

    await debug_admin_reception({
      event: 'admin_reception_session_resolved',
      payload: {
        admin_user_uuid: context.admin_user_uuid,
        role: context.role,
        tier: context.tier,
      },
    })

    const result = await apply_admin_reception_request({
      admin_user_uuid: context.admin_user_uuid,
      body,
    })

    if (!result.ok) {
      await debug_admin_reception({
        event: 'admin_reception_failed',
        payload: {
          step: 'apply_request',
          error_message: result.error,
          error_code: result.status,
        },
      })

      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status },
      )
    }

    return NextResponse.json({
      ok: true,
      admin_user_uuid: context.admin_user_uuid,
      state: result.record.state,
      updated_at: result.record.updated_at,
    })
  } catch (error) {
    await debug_admin_reception({
      event: 'admin_reception_failed',
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
