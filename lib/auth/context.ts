/**
 * Browser / LINE detection for auth routing (Edge-safe, no DB).
 */

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
 * LINE in-app browser or LIFF-capable WebView (substring match, lowercase).
 */
export function is_line_in_app_browser(
  user_agent: string | null | undefined,
): boolean {
  const ua = user_agent?.toLowerCase() ?? ''

  return ua.includes('line/') || ua.includes('liff')
}

/**
 * OAuth / LIFF return to the app endpoint (avoid redirect loop to liff.line.me).
 */
export function is_liff_oauth_return(search_params: URLSearchParams): boolean {
  return (
    search_params.has('code') ||
    search_params.has('liff.state') ||
    search_params.has('liffClientId')
  )
}

export function should_redirect_line_browser_to_liff(input: {
  pathname: string
  search_params: URLSearchParams
  user_agent: string | null
}): boolean {
  if (!is_line_in_app_browser(input.user_agent)) {
    return false
  }

  if (
    input.pathname.startsWith('/liff') ||
    input.pathname.startsWith('/api') ||
    input.pathname.startsWith('/_next')
  ) {
    return false
  }

  if (is_public_asset_path(input.pathname)) {
    return false
  }

  if (is_liff_oauth_return(input.search_params)) {
    return false
  }

  return true
}
