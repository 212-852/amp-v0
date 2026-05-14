/**
 * Browser / LINE detection for auth routing (Edge-safe, no DB).
 */

import type { browser_session_source_channel } from '@/lib/auth/session'

export function is_public_asset_path(pathname: string) {
  if (
    pathname.startsWith('/images/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/fonts/')
  ) {
    return true
  }

  return /\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|png|svg|txt|webmanifest|webp|woff2?)$/i.test(
    pathname,
  )
}

/**
 * LINE in-app browser (LINE WebView). Use for LIFF vs desktop OAuth split.
 * Do not treat desktop browsers with `liff.referrer` or other URL hints alone.
 */
export function is_line_in_app_browser(
  user_agent: string | null | undefined,
): boolean {
  const ua = user_agent?.toLowerCase() ?? ''

  return ua.includes('line/')
}

/**
 * Keep aligned with `infer_source_channel_from_ua` in `lib/auth/session.ts`
 * (middleware imports this module; avoid importing session runtime here).
 */
function infer_browser_session_source_from_user_agent(
  user_agent: string | null,
): browser_session_source_channel {
  const ua = user_agent?.toLowerCase() ?? ''

  if (ua.includes('line/') || ua.includes('liff')) {
    return 'liff'
  }

  return 'web'
}

export function normalize_browser_session_source_for_request(input: {
  browser_channel_cookie: string | null
  client_source_channel: string | null
  user_agent: string | null
}): browser_session_source_channel {
  const client_raw = input.client_source_channel?.trim().toLowerCase()

  if (client_raw === 'liff' || client_raw === 'pwa') {
    return client_raw
  }

  const raw = input.browser_channel_cookie?.trim().toLowerCase()

  if (raw === 'liff' || raw === 'pwa') {
    return raw
  }

  return infer_browser_session_source_from_user_agent(input.user_agent)
}
