/**
 * Single SELECT list for `public.rooms`. Do not duplicate elsewhere.
 *
 * `room_select_fields_core` works before migration that adds last_incoming_*.
 * `room_select_fields` adds reply-routing columns only; callers must fall back
 * to core when the DB returns undefined-column errors.
 */
function format_room_select_list(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.trim().replace(/,$/, ''))
    .filter(Boolean)
    .join(', ')
}

const room_select_fields_core_raw = `
room_uuid,
room_type,
status,
mode,
action_id,
created_at,
updated_at
`

const room_select_fields_last_incoming_raw = `
last_incoming_channel,
last_incoming_at
`

export const room_select_fields_core = format_room_select_list(
  room_select_fields_core_raw,
)

export const room_select_fields = format_room_select_list(
  `${room_select_fields_core_raw},
${room_select_fields_last_incoming_raw}`,
)

export function is_missing_room_last_incoming_columns_error(
  error: unknown,
): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const e = error as {
    code?: string
    message?: string
    details?: string
    hint?: string
  }
  const blob = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`.toLowerCase()

  if (e.code === '42703') {
    return (
      blob.includes('last_incoming_channel') ||
      blob.includes('last_incoming_at')
    )
  }

  if (e.code === 'PGRST204' && blob.includes('last_incoming')) {
    return true
  }

  if (blob.includes('does not exist')) {
    if (blob.includes('last_incoming_channel')) {
      return true
    }
    if (blob.includes('last_incoming_at')) {
      return true
    }
  }

  return false
}
