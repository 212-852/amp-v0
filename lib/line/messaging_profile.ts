import 'server-only'

const LINE_BOT_PROFILE_URL = 'https://api.line.me/v2/bot/profile'

export type line_messaging_user_profile = {
  userId: string
  displayName: string
  pictureUrl?: string
  language?: string
  statusMessage?: string
}

/**
 * Messaging API: GET /v2/bot/profile/{userId}
 * Requires LINE_MESSAGING_CHANNEL_ACCESS_TOKEN (same channel as webhook).
 */
export async function fetch_line_messaging_profile(
  line_user_id: string | null | undefined,
): Promise<line_messaging_user_profile | null> {
  const access_token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN

  if (!line_user_id?.trim() || !access_token) {
    return null
  }

  const encoded = encodeURIComponent(line_user_id.trim())
  const response = await fetch(`${LINE_BOT_PROFILE_URL}/${encoded}`, {
    headers: {
      authorization: `Bearer ${access_token}`,
    },
  })

  if (!response.ok) {
    return null
  }

  const raw = (await response.json()) as Record<string, unknown>

  if (typeof raw.userId !== 'string' || typeof raw.displayName !== 'string') {
    return null
  }

  return {
    userId: raw.userId,
    displayName: raw.displayName,
    pictureUrl: typeof raw.pictureUrl === 'string' ? raw.pictureUrl : undefined,
    language: typeof raw.language === 'string' ? raw.language : undefined,
    statusMessage:
      typeof raw.statusMessage === 'string' ? raw.statusMessage : undefined,
  }
}
