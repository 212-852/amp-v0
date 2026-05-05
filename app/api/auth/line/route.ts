import { randomUUID } from 'crypto'

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { build_line_auth_url } from '@/lib/auth/line_oauth'
import { line_login_channel_id } from '@/lib/config/line_env'

export const line_login_state_cookie_name = 'line_login_state'

/**
 * Normal LINE Login (OAuth) start only. LIFF uses `LiffBootstrap` + `POST /api/auth/liff` (see `lib/auth/liff_login.ts`).
 */
export async function GET() {
  const client_id = line_login_channel_id()
  const callback_url = process.env.LINE_LOGIN_CALLBACK_URL?.trim()

  if (!client_id || !callback_url) {
    return NextResponse.json(
      { error: 'LINE Login is not configured' },
      { status: 500 },
    )
  }

  const state = randomUUID()
  const cookie_store = await cookies()

  cookie_store.set(line_login_state_cookie_name, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  })

  const authorize = build_line_auth_url({
    client_id,
    redirect_uri: callback_url,
    state,
  })

  return NextResponse.redirect(authorize)
}
