/**
 * Single SELECT list for `public.rooms`. Do not duplicate elsewhere.
 */
export const room_select_fields = `
room_uuid,
room_type,
status,
mode,
action_id,
last_incoming_channel,
last_incoming_at,
created_at,
updated_at
`
  .split('\n')
  .map((line) => line.trim().replace(/,$/, ''))
  .filter(Boolean)
  .join(', ')
