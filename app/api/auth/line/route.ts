import { randomUUID } from 'crypto'

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { line_login_channel_id } from '@/lib/config/line_env'

export const line_login_state_cookie_name = 'line_login_state'

/**
 * Starts normal LINE Login (OAuth). LIFF app entry uses `LiffBootstrap` + `/api/auth/liff`, not this route.
 * Register callback URL in LINE Developers as `LINE_LOGIN_CALLBACK_URL` (e.g. `/api/auth/line/callback`).
 * Register LIFF endpoint separately as the app root `https://app.da-nya.com/` (not this callback).
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

  const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize')

  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', client_id)
  authorize.searchParams.set('redirect_uri', callback_url)
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('scope', 'openid profile')

  return NextResponse.redirect(authorize)
}
