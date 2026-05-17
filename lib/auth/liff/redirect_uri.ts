import { normalize_line_link_return_path } from '@/lib/auth/link/return_path'

/**
 * Preserves pathname and safe query params (e.g. return_path) for LIFF OAuth round-trip.
 */
export function build_liff_redirect_uri(input?: {
  origin?: string
  pathname?: string
  search?: string
}): string {
  if (typeof window === 'undefined') {
    const origin = input?.origin?.replace(/\/$/, '') ?? ''
    const pathname = input?.pathname ?? '/'
    const search = input?.search ?? ''

    return `${origin}${pathname}${search}`
  }

  const url = new URL(window.location.href)
  const return_path = normalize_line_link_return_path(
    url.searchParams.get('return_path'),
  )

  if (return_path) {
    url.searchParams.set('return_path', return_path)
  } else {
    url.searchParams.delete('return_path')
  }

  url.hash = ''

  return url.toString()
}

export function read_return_path_from_location(
  search?: string | null,
): string | null {
  if (typeof window === 'undefined') {
    const params = new URLSearchParams(search ?? '')
    return normalize_line_link_return_path(params.get('return_path'))
  }

  return normalize_line_link_return_path(
    new URLSearchParams(window.location.search).get('return_path'),
  )
}
