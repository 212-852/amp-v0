import 'server-only'

import { detect_switch_mode } from '@/lib/chat/rules'

import { bot_intent_phrases, bot_intent_words } from './content'
import type {
  bot_action,
  bot_decision,
  bot_decision_input,
  bot_intent,
} from './types'

export type { bot_action, bot_decision, bot_decision_input, bot_intent }

/**
 * Re-exported so callers always reach the single switch-mode source
 * via the bot/ module. Do not maintain a second copy of the keyword list.
 */
export { detect_switch_mode } from '@/lib/chat/rules'

type intent_keyword_set = keyof typeof bot_intent_words

const NON_SWITCH_INTENTS: ReadonlyArray<intent_keyword_set> = [
  'handoff_request',
  'cancel_request',
  'booking_request',
  'availability_check',
  'price_question',
  'airport_transfer',
  'hospital_transfer',
]

const intent_to_action: Record<intent_keyword_set, bot_action> = {
  handoff_request: 'switch_mode',
  cancel_request: 'handoff',
  booking_request: 'ask_followup',
  availability_check: 'ask_followup',
  price_question: 'reply',
  airport_transfer: 'ask_followup',
  hospital_transfer: 'ask_followup',
}

const intent_to_content_key: Record<intent_keyword_set, string | undefined> = {
  handoff_request: 'bot.handoff.urgent',
  cancel_request: 'bot.cancel.received',
  booking_request: 'bot.booking.followup',
  availability_check: 'bot.availability.followup',
  price_question: 'bot.price.summary',
  airport_transfer: 'bot.airport.followup',
  hospital_transfer: 'bot.hospital.followup',
}

function normalize_input_text(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .replace(/[\u3000\s]+/g, ' ')
    .toLowerCase()
}

const normalized_intent_words: Record<intent_keyword_set, string[]> = (() => {
  const out = {} as Record<intent_keyword_set, string[]>
  for (const intent of Object.keys(bot_intent_words) as intent_keyword_set[]) {
    out[intent] = bot_intent_words[intent].map(normalize_input_text)
  }
  return out
})()

function decision_for_intent(input: {
  intent: intent_keyword_set
  reason: string
  confidence: number
}): bot_decision {
  const action = intent_to_action[input.intent]
  const content_key = intent_to_content_key[input.intent]
  const decision: bot_decision = {
    intent: input.intent as bot_intent,
    action,
    confidence: input.confidence,
    reason: input.reason,
  }

  if (content_key) {
    decision.content_key = content_key
  }

  if (input.intent === 'handoff_request') {
    decision.mode = 'concierge'
  }

  return decision
}

function unknown_decision(reason: string): bot_decision {
  return {
    intent: 'unknown',
    action: 'ignore',
    confidence: 0,
    reason,
  }
}

/**
 * Pure deterministic chatbot decision function.
 *
 * Order:
 *   1. switch_mode keyword (single source via detect_switch_mode); allowed during concierge
 *   2. exact-match intent words (handoff > cancel > booking > availability > ...)
 *   3. anchored intent phrase patterns
 *   4. unknown (let upstream optionally fall back to AI)
 *
 * When concierge_staff_active, deterministic auto-replies (2-3) are skipped; switch_mode (1) still applies.
 *
 * Pure: no DB, no fetch, no archive, no AI, no logging.
 */
export function decide_bot_action(
  input: bot_decision_input,
): bot_decision {
  const text = typeof input.text === 'string' ? input.text : ''

  if (text.trim().length === 0) {
    return unknown_decision('empty_text')
  }

  const switch_mode = detect_switch_mode(text)

  if (switch_mode) {
    return {
      intent: 'switch_mode',
      action: 'switch_mode',
      confidence: 1,
      mode: switch_mode,
      content_key: `room.mode.switch.${switch_mode}`,
      reason: 'switch_mode_keyword',
    }
  }

  if (input.concierge_staff_active === true) {
    return unknown_decision('concierge_staff_active')
  }

  const normalized = normalize_input_text(text)

  for (const intent of NON_SWITCH_INTENTS) {
    if (normalized_intent_words[intent].includes(normalized)) {
      return decision_for_intent({
        intent,
        reason: 'exact_keyword_match',
        confidence: 0.95,
      })
    }
  }

  for (const intent of NON_SWITCH_INTENTS) {
    const patterns = bot_intent_phrases[intent]

    if (!patterns) {
      continue
    }

    if (patterns.some((pattern) => pattern.test(normalized))) {
      return decision_for_intent({
        intent,
        reason: 'phrase_match',
        confidence: 0.85,
      })
    }
  }

  return unknown_decision('no_deterministic_match')
}
