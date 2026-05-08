import 'server-only'

/**
 * Coerce a UUID-bearing value to a strict `string | null`.
 * Empty strings, whitespace, "null"/"undefined" sentinels are treated as null.
 * Never returns an empty string.
 */
export function clean_uuid(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  if (
    trimmed.length === 0 ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined'
  ) {
    return null
  }

  return trimmed
}
