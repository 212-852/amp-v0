import { NextResponse } from 'next/server'

import {
  apply_admin_availability_request,
  read_admin_chat_availability,
} from '@/lib/admin/availability/action'
import { resolve_admin_availability_context } from '@/lib/admin/availability/context'
import type { admin_availability_request_input } from '@/lib/admin/availability/rules'

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
  const context = await resolve_admin_availability_context()

  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    )
  }

  const body = (await request.json().catch(() => null)) as
    | admin_availability_request_input
    | null

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

  return NextResponse.json({
    ok: true,
    admin_user_uuid: context.admin_user_uuid,
    chat_available: result.state.chat_available,
    updated_at: result.state.updated_at,
  })
}
