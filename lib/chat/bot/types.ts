import type { chat_channel, room_mode } from '@/lib/chat/room'

/**
 * High-level intent inferred from a single chat message.
 * Keep this list stable; downstream action layer branches on it.
 */
export type bot_intent =
  | 'switch_mode'
  | 'booking_request'
  | 'availability_check'
  | 'price_question'
  | 'airport_transfer'
  | 'hospital_transfer'
  | 'cancel_request'
  | 'handoff_request'
  | 'unknown'

/**
 * What the action layer should do with the message.
 * Rules layer only proposes; never executes.
 */
export type bot_action =
  | 'reply'
  | 'ask_followup'
  | 'switch_mode'
  | 'handoff'
  | 'ignore'

/**
 * Normalized decision returned by lib/chat/bot/rules.ts.
 * - `confidence` is in [0, 1].
 * - `mode` is only meaningful when `action === 'switch_mode'`.
 * - `content_key` references a localized bundle key the action layer
 *   can later resolve via lib/chat/message.ts.
 * - `reason` is a short tag explaining why the rule fired
 *   (used in debug logs / Discord traces, not user-facing).
 */
export type bot_decision = {
  intent: bot_intent
  action: bot_action
  confidence: number
  mode?: room_mode
  content_key?: string
  reason: string
}

/**
 * Input shape consumed by `decide_bot_action`.
 * Pure data only - no DB rows, no Supabase clients, no requests.
 */
export type bot_decision_input = {
  text: string
  locale: string
  current_mode: room_mode
  source_channel: chat_channel
}
