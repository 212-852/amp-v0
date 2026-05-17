import { NextResponse } from 'next/server'

import { list_available_admin_users } from '@/lib/admin/management/action'
import { require_admin_management_access } from '@/lib/admin/management/context'
import { debug_event } from '@/lib/debug'

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
  try {
    await require_admin_management_access()
    const admins = await list_available_admin_users()

    return NextResponse.json({
      ok: true,
      admins,
    })
  } catch (error) {
    await debug_event({
      category: 'admin_management',
      event: 'admin_availability_realtime_failed',
      payload: {
        step: 'list_available_admins',
        ...serialize_error(error),
      },
    })

    return NextResponse.json(
      { ok: false, error: 'admin_availability_failed' },
      { status: 500 },
    )
  }
}
