/**
 * Pathname normalization for breadcrumb building only.
 * No routing decisions.
 */

function strip_query_and_hash(pathname: string) {
  const without_hash = pathname.split('#')[0] ?? pathname
  return without_hash.split('?')[0] ?? without_hash
}

function should_skip_segment(segment: string) {
  if (!segment) {
    return true
  }

  if (segment.startsWith('_')) {
    return true
  }

  if (segment === 'api') {
    return true
  }

  return false
}

export function normalize_pathname(pathname: string) {
  const cleaned = strip_query_and_hash(pathname).trim()
  const trimmed_slashes = cleaned.replace(/^\/+|\/+$/g, '')

  if (!trimmed_slashes) {
    return []
  }

  return trimmed_slashes
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => !should_skip_segment(segment))
}
