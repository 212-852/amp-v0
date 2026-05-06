/**
 * Single source of truth for `public.rooms` SELECT lists.
 * Do not duplicate room column lists elsewhere.
 *
 * Baseline shape (user_uuid, visitor_uuid, status, source_channel, action_id, timestamps)
 * plus `mode` and `room_type` required for bot/concierge and direct-room routing.
 */
export const room_select_fields = `
room_uuid,
mode,
room_type,
user_uuid,
visitor_uuid,
status,
source_channel,
action_id,
created_at,
updated_at
`
  .split('\n')
  .map((line) => line.trim().replace(/,$/, ''))
  .filter(Boolean)
  .join(', ')
