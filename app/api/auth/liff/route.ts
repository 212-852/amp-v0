import { NextResponse } from 'next/server'

import { resolve_auth_access } from '@/lib/auth/access'
import { control } from '@/lib/config/control'
import { debug } from '@/lib/debug'

type liff_auth_body = {
  line_user_id?: string
  display_name?: string | null
  image_url?: string | null
  locale?: string | null
}

function get_allowed_user_ids() {
  return (
    process.env.LINE_REPLY_ALLOWED_USER_IDS
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean) ?? []
  )
}

function is_allowed_line_user(line_user_id: string) {
  if (process.env.LINE_REPLY_TEST_MODE !== 'true') {
    return true
  }

  return get_allowed_user_ids().includes(line_user_id)
}

async function debug_liff_failed(
  reason: string,
  data?: Record<string, unknown>,
) {
  if (!control.debug.liff_auth) {
    return
  }

  await debug({
    category: 'liff',
    event: 'liff_auth_failed',
    data: {
      reason,
      ...data,
    },
  })
}

export async function POST(request: Request) {
  const body = (await request.json()) as liff_auth_body
  const line_user_id = body.line_user_id

  if (!line_user_id) {
    await debug_liff_failed('missing_line_user_id')

    return NextResponse.json(
      { ok: false, error: 'Missing line_user_id' },
      { status: 400 },
    )
  }

  if (!is_allowed_line_user(line_user_id)) {
    await debug_liff_failed('test_mode_blocked', {
      line_user_id,
    })

    return NextResponse.json(
      { ok: false, error: 'LINE user is not allowed' },
      { status: 403 },
    )
  }

  try {
    const access = await resolve_auth_access({
      provider: 'line',
      provider_id: line_user_id,
      display_name: body.display_name ?? null,
      image_url: body.image_url ?? null,
      locale: body.locale ?? null,
    })

    if (control.debug.liff_auth) {
      await debug({
        category: 'liff',
        event: 'liff_auth_passed',
        data: {
          user_uuid: access.user_uuid,
          visitor_uuid: access.visitor_uuid,
          is_new_user: access.is_new_user,
          is_new_visitor: access.is_new_visitor,
          line_user_id,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      user_uuid: access.user_uuid,
      visitor_uuid: access.visitor_uuid,
      is_new_user: access.is_new_user,
      is_new_visitor: access.is_new_visitor,
    })
  } catch {
    await debug_liff_failed('resolve_auth_access_failed', {
      line_user_id,
    })

    return NextResponse.json(
      { ok: false, error: 'LIFF auth failed' },
      { status: 500 },
    )
  }
}
