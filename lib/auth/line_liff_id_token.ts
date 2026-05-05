import 'server-only'

import { line_liff_verify_channel_id } from '@/lib/config/line_env'

const LINE_VERIFY_ID_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/verify'

/**
 * Verifies a LIFF-issued ID token via LINE (no LINE_LOGIN_CHANNEL_SECRET).
 */
export async function verify_line_liff_id_token(
  id_token: string,
): Promise<{ sub: string } | null> {
  const client_id = line_liff_verify_channel_id()
  const token = id_token?.trim()

  if (!client_id || !token) {
    return null
  }

  const body = new URLSearchParams({
    id_token: token,
    client_id,
  })

  const response = await fetch(LINE_VERIFY_ID_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as { sub?: string }

  if (typeof data.sub !== 'string' || data.sub.length === 0) {
    return null
  }

  return { sub: data.sub }
}
