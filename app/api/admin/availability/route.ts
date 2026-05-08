import { NextResponse } from 'next/server'

import {
  apply_admin_availability_request,
  read_admin_chat_availability,
} from '@/lib/admin/availability/action'
import { resolve_admin_availability_context } from '@/lib/admin/availability/context'
import { debug_admin_availability } from '@/lib/admin/availability/debug'
import type { admin_availability_request_input } from '@/lib/admin/availability/rules'

function serialize_error(error: unknown) {
  return {
    error_message: error instanceof Error ? error.message : String(error),
    error_code:
      error && typeof error === 'object' && 'code' in error
        ? error.code ?? null
        : null,
  }
}

function read_debug_admin_uuid(body: admin_availability_request_input | null) {
  if (!body || typeof body !== 'object' || !('admin_uuid' in body)) {
    return null
  }

  return typeof body.admin_uuid === 'string' ? body.admin_uuid : null
}

export async function GET() {
  const context = await resolve_admin_availability_context()

  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    )
  }

  const state = await read_admin_chat_availability(context.admin_user_uuid)

  return NextResponse.json({
    ok: true,
    admin_user_uuid: context.admin_user_uuid,
    chat_available: state.chat_available,
    updated_at: state.updated_at,
  })
}

export async function POST(request: Request) {
  let body: admin_availability_request_input | null = null

  try {
    body = (await request.json().catch(() => null)) as
      | admin_availability_request_input
      | null

    await debug_admin_availability({
      event: 'admin_availability_api_entered',
      payload: {
        method: request.method,
        admin_uuid: read_debug_admin_uuid(body),
        body,
      },
    })

    const context = await resolve_admin_availability_context()

    if (!context.ok) {
      await debug_admin_availability({
        event: 'admin_availability_failed',
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

    await debug_admin_availability({
      event: 'admin_availability_session_resolved',
      payload: {
        user_uuid: context.user_uuid,
        role: context.role,
        tier: context.tier,
      },
    })

    const result = await apply_admin_availability_request({
      admin_user_uuid: context.admin_user_uuid,
      body,
    })

    if (!result.ok) {
      await debug_admin_availability({
        event: 'admin_availability_failed',
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
      chat_available: result.state.chat_available,
      updated_at: result.state.updated_at,
    })
  } catch (error) {
    await debug_admin_availability({
      event: 'admin_availability_failed',
      payload: {
        step: 'unexpected',
        ...serialize_error(error),
      },
    })

    return NextResponse.json(
      { ok: false, error: 'admin_availability_failed' },
      { status: 500 },
    )
  }
}
