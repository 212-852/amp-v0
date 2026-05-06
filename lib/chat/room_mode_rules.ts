import 'server-only'

import type { room_mode } from './room'

export type room_mode_gate_row = {
  mode: room_mode
  assigned_admin_uuid: string | null
}

export function room_mode_can_request_concierge(
  row: room_mode_gate_row,
): boolean {
  return row.mode === 'bot'
}

export function room_mode_can_accept_concierge(
  row: room_mode_gate_row,
): boolean {
  return row.mode === 'concierge' && row.assigned_admin_uuid === null
}

export function room_mode_can_resume_bot(row: room_mode_gate_row): boolean {
  return row.mode === 'concierge'
}
