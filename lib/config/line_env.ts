/**
 * LINE Login / LIFF (LIFF id is public via NEXT_PUBLIC_*).
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
