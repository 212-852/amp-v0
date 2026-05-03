import { randomUUID } from 'crypto'

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { debug } from '@/lib/debug'

export const google_login_state_cookie_name = 'google_login_state'

export async function GET() {
  const client_id = process.env.GOOGLE_CLIENT_ID
  const callback_url = process.env.GOOGLE_LOGIN_CALLBACK_URL

  if (!client_id || !callback_url) {
    return NextResponse.json(
      { error: 'Google login is not configured' },
      { status: 500 },
    )
  }

  const state = randomUUID()
  const cookie_store = await cookies()

  cookie_store.set(google_login_state_cookie_name, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  })

  const login_url = new URL('https://accounts.google.com/o/oauth2/v2/auth')

  login_url.searchParams.set('response_type', 'code')
  login_url.searchParams.set('client_id', client_id)
  login_url.searchParams.set('redirect_uri', callback_url)
  login_url.searchParams.set('scope', 'openid email profile')
  login_url.searchParams.set('prompt', 'select_account')
  login_url.searchParams.set('state', state)

  await debug({
    category: 'auth',
    event: 'google_login_redirect',
  })

  return NextResponse.redirect(login_url)
}
