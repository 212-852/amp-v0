import 'server-only'

/**
 * Physical `public` action log table (e.g. legacy `4_actions`).
 * Override when the deployed name differs.
 */
export function public_actions_table_name(): string {
  const raw = process.env.ACTIONS_TABLE_NAME?.trim()

  if (raw && raw.length > 0) {
    return raw
  }

  return '4_actions'
}
