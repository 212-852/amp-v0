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
 * LINE in-app browser (LINE WebView). Use for LIFF vs desktop OAuth split.
 * Do not treat desktop browsers with `liff.referrer` or other URL hints alone.
 */
export function is_line_in_app_browser(
  user_agent: string | null | undefined,
): boolean {
  const ua = user_agent?.toLowerCase() ?? ''

  return ua.includes('line/')
}
