'use client'

export type detected_source_channel = 'web' | 'pwa' | 'liff'

export type source_channel_detection = {
  detected_channel: detected_source_channel
  is_liff: boolean
  is_pwa: boolean
  display_mode: string | null
  navigator_standalone: boolean
  has_liff_object: boolean
  user_agent: string
}

function window_has_liff_object() {
  return (
    typeof window !== 'undefined' &&
    typeof (window as Window & { liff?: unknown }).liff !== 'undefined'
  )
}

function pathname_or_query_indicates_liff() {
  if (typeof window === 'undefined') {
    return false
  }

  const path = window.location.pathname.toLowerCase()
  const query = window.location.search.toLowerCase()
  const hash = window.location.hash.toLowerCase()

  return (
    path.includes('/liff') ||
    query.includes('liff') ||
    query.includes('source_channel=liff') ||
    hash.includes('liff')
  )
}

function user_agent_indicates_liff(user_agent: string) {
  const normalized = user_agent.toLowerCase()

  return normalized.includes('liff') || normalized.includes('line/')
}

export function detect_source_channel(): source_channel_detection {
  const user_agent =
    typeof window !== 'undefined' ? window.navigator.userAgent : ''
  const display_mode =
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches
      ? 'standalone'
      : 'browser'
  const navigator_standalone =
    typeof window !== 'undefined' &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  const has_liff_object = window_has_liff_object()
  const is_liff =
    has_liff_object ||
    user_agent_indicates_liff(user_agent) ||
    pathname_or_query_indicates_liff()
  const is_pwa =
    !is_liff && (display_mode === 'standalone' || navigator_standalone)

  return {
    detected_channel: is_liff ? 'liff' : is_pwa ? 'pwa' : 'web',
    is_liff,
    is_pwa,
    display_mode,
    navigator_standalone,
    has_liff_object,
    user_agent,
  }
}
