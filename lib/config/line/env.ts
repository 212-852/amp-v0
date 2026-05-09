/**
 * LINE Login / LIFF (LIFF id is public via NEXT_PUBLIC_LIFF_ID).
 *
 * - Normal LINE Login OAuth: `lib/auth/line_oauth.ts` + LINE_LOGIN_* env (authorize / token exchange).
 * - LIFF id-token login: `lib/auth/liff_login.ts` + POST `/api/auth/line/liff` (no LINE_LOGIN_*, no access.line.me).
 *
 * Messaging API (webhook, outbound reply):
 * - LINE_MESSAGING_CHANNEL_SECRET (signature verification only)
 * - LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
 *
 * Do not use Messaging API secrets for LINE Login token exchange or LIFF.
 * Do not use LINE Login secret for webhook signature verification.
 */

export function next_public_liff_id(): string {
  return process.env.NEXT_PUBLIC_LIFF_ID?.trim() ?? ''
}

/**
 * Channel ID for `POST https://api.line.me/oauth2/v2.1/verify` with LIFF id_token.
 * Prefer `LINE_LIFF_CHANNEL_ID`; else derive numeric prefix from `NEXT_PUBLIC_LIFF_ID` (e.g. `2006953406-xxxx`).
 */
export function line_liff_verify_channel_id(): string | null {
  const explicit = process.env.LINE_LIFF_CHANNEL_ID?.trim()

  if (explicit) {
    return explicit
  }

  const liff = process.env.NEXT_PUBLIC_LIFF_ID?.trim()

  if (!liff) {
    return null
  }

  const dash = liff.indexOf('-')

  if (dash <= 0) {
    return null
  }

  const prefix = liff.slice(0, dash)

  return /^\d+$/.test(prefix) ? prefix : null
}

export function line_login_channel_id(): string | undefined {
  const value = process.env.LINE_LOGIN_CHANNEL_ID?.trim()

  return value || undefined
}

export function line_login_channel_secret(): string | undefined {
  const value = process.env.LINE_LOGIN_CHANNEL_SECRET?.trim()

  return value || undefined
}
