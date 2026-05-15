/**
 * Single SELECT list for `public.rooms`. Do not duplicate elsewhere.
 *
 * Tiered selects: full (last_incoming + admin unread denorm) -> with last_incoming
 * -> core only. Callers fall back when optional columns are absent.
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

const room_select_fields_admin_unread_raw = `
unread_admin_count,
admin_last_read_at,
last_message_at,
last_message_body
`

export const room_select_fields_core = format_room_select_list(
  room_select_fields_core_raw,
)

/** Core + last_incoming_* (no admin unread denorm columns). */
export const room_select_fields_with_last_incoming = format_room_select_list(
  `${room_select_fields_core_raw},
${room_select_fields_last_incoming_raw}`,
)

/** Full row for admin inbox + unread (requires migrations). */
export const room_select_fields = format_room_select_list(
  `${room_select_fields_core_raw},
${room_select_fields_last_incoming_raw},
${room_select_fields_admin_unread_raw}`,
)

const optional_room_select_column_markers = [
  'last_incoming_channel',
  'last_incoming_at',
  'unread_admin_count',
  'admin_last_read_at',
  'last_message_at',
  'last_message_body',
]

export function is_missing_room_optional_select_columns_error(
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
    return optional_room_select_column_markers.some((m) => blob.includes(m))
  }

  if (e.code === 'PGRST204') {
    return optional_room_select_column_markers.some((m) => blob.includes(m))
  }

  if (blob.includes('does not exist')) {
    return optional_room_select_column_markers.some((m) => blob.includes(m))
  }

  return false
}

/** @deprecated Use is_missing_room_optional_select_columns_error */
export function is_missing_room_last_incoming_columns_error(
  error: unknown,
): boolean {
  return is_missing_room_optional_select_columns_error(error)
}
