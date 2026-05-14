export const pwa_line_link_purpose = 'pwa_line_link' as const

export type one_time_pass_status =
  | 'open'
  | 'completed'
  | 'expired'
  | 'failed'
  | 'closed'

export function is_valid_pass_uuid(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') {
    return false
  }

  const trimmed = raw.trim()

  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  )
}

export function normalize_pass_code(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim() : ''
}
