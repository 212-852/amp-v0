import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { build_line_login_oauth_state } from '@/lib/auth/line/state'
import { visitor_cookie_name } from '@/lib/auth/session'
import { control } from '@/lib/config/control'
import { debug_event } from '@/lib/debug'

export const line_login_state_cookie_name = 'line_login_state'

export async function GET() {
  const channel_id = process.env.LINE_LOGIN_CHANNEL_ID
  const callback_url = process.env.LINE_LOGIN_CALLBACK_URL

  if (!callback_url || !channel_id) {
    if (control.debug.line) {
      await debug_event({
        category: 'line',
        event: 'line_login_redirect_failed',
        payload: {
          has_callback_url: Boolean(callback_url),
          has_channel_id: Boolean(channel_id),
        },
      })
    }

    return NextResponse.json(
      { error: 'LINE login is not configured' },
      { status: 500 },
    )
  }

  const cookie_store = await cookies()
  const browser_visitor_uuid =
    cookie_store.get(visitor_cookie_name)?.value ?? null
  const state = build_line_login_oauth_state(browser_visitor_uuid)

  cookie_store.set(line_login_state_cookie_name, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  })

  const login_url = new URL('https://access.line.me/oauth2/v2.1/authorize')

  login_url.searchParams.set('response_type', 'code')
  login_url.searchParams.set('client_id', channel_id)
  login_url.searchParams.set('redirect_uri', callback_url)
  login_url.searchParams.set('state', state)
  login_url.searchParams.set('scope', 'profile')

  return NextResponse.redirect(login_url)
}
