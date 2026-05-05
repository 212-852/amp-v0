import 'server-only'

import {
  line_login_channel_id,
  line_login_channel_secret,
} from '@/lib/config/line_env'

/**
 * Normal LINE Login (OAuth) only. Used by `/api/auth/line` and `/api/auth/line/callback`.
 * Do not import this module from LIFF (`/api/auth/liff`, `liff_login.ts`).
 */

const LINE_AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize'
const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token'
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile'

export type line_oauth_profile = {
  userId?: string
  displayName?: string
  pictureUrl?: string
}

type line_token_response = {
  access_token?: string
}

export function build_line_auth_url(input: {
  client_id: string
  redirect_uri: string
  state: string
  scope?: string
}): URL {
  const authorize = new URL(LINE_AUTHORIZE_URL)

  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', input.client_id)
  authorize.searchParams.set('redirect_uri', input.redirect_uri)
  authorize.searchParams.set('state', input.state)
  authorize.searchParams.set('scope', input.scope ?? 'openid profile')

  return authorize
}

export async function exchange_line_code_for_token(
  code: string,
): Promise<string | null> {
  const client_id = line_login_channel_id()
  const client_secret = line_login_channel_secret()
  const redirect_uri = process.env.LINE_LOGIN_CALLBACK_URL?.trim()

  if (!client_id || !client_secret || !redirect_uri) {
    return null
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri,
    client_id,
    client_secret,
  })

  const response = await fetch(LINE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    return null
  }

  const token = (await response.json()) as line_token_response

  return token.access_token ?? null
}

export async function fetch_line_oauth_profile(
  access_token: string,
): Promise<line_oauth_profile | null> {
  const response = await fetch(LINE_PROFILE_URL, {
    headers: {
      authorization: `Bearer ${access_token}`,
    },
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as line_oauth_profile
}
