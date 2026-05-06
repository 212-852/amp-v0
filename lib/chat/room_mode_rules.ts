import 'server-only'

import type { room_mode } from './room'

export type room_mode_gate_row = {
  mode: room_mode
}

export function room_mode_can_request_concierge(
  row: room_mode_gate_row,
): boolean {
  return row.mode === 'bot'
}

export function room_mode_can_accept_concierge(
  row: room_mode_gate_row,
): boolean {
  return row.mode === 'concierge'
}

export function room_mode_can_resume_bot(row: room_mode_gate_row): boolean {
  return row.mode === 'concierge'
}
