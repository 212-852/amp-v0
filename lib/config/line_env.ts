/**
 * LINE Login / LIFF (LIFF id is public via NEXT_PUBLIC_LIFF_ID).
 *
 * - Normal LINE Login OAuth: `lib/auth/line_oauth.ts` + LINE_LOGIN_* env (authorize / token exchange).
 * - LIFF: `lib/auth/liff_login.ts` + POST `/api/auth/liff` only (no LINE_LOGIN_CALLBACK_URL, no access.line.me).
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

export function line_login_channel_id(): string | undefined {
  const value = process.env.LINE_LOGIN_CHANNEL_ID?.trim()

  return value || undefined
}

export function line_login_channel_secret(): string | undefined {
  const value = process.env.LINE_LOGIN_CHANNEL_SECRET?.trim()

  return value || undefined
}
