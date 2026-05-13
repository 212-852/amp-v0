import 'server-only'

/**
 * Physical `public` action log table.
 *
 * The deployed Supabase schema currently exposes `public.chat_actions`.
 * Set ACTIONS_TABLE_NAME only when a legacy table such as `4_actions` is
 * actually present in PostgREST schema metadata.
 * Override when the deployed name differs.
 */
export function public_actions_table_name(): string {
  const raw = process.env.ACTIONS_TABLE_NAME?.trim()

  if (raw && raw.length > 0) {
    return raw
  }

  return 'chat_actions'
}
