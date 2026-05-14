import type { archived_message } from './archive'
import type { message_bundle } from './message'
import type { room_mode } from './room'
import type { chat_locale } from './message'

/**
 * Snapshot fields used to decide whether concierge / human support is active.
 * Maps product language: support_mode ~= rooms.mode, assigned admin on concierge_json.
 */
export type concierge_auto_reply_gate_input = {
  room_mode: string | null | undefined
  room_status: string | null | undefined
  concierge_snapshot?: {
    assigned_admin_user_uuid?: string | null
  } | null
}

export function resolve_concierge_staff_controls_chat(
  input: concierge_auto_reply_gate_input,
): boolean {
  const mode =
    typeof input.room_mode === 'string' ? input.room_mode.trim().toLowerCase() : ''

  if (mode === 'concierge') {
    return true
  }

  const st =
    typeof input.room_status === 'string'
      ? input.room_status.trim().toLowerCase()
      : ''

  if (st === 'active_support') {
    return true
  }

  const u = input.concierge_snapshot?.assigned_admin_user_uuid

  if (typeof u === 'string' && u.trim().length > 0) {
    return true
  }

  return false
}

export function should_skip_bot_auto_reply(
  input: concierge_auto_reply_gate_input,
): boolean {
  return resolve_concierge_staff_controls_chat(input)
}

export function can_switch_to_concierge(input: {
  role: string | null | undefined
  tier: string | null | undefined
}): boolean {
  return (
    input.role === 'user' &&
    (input.tier === 'member' || input.tier === 'vip')
  )
}

export function can_create_handoff_memo(input: {
  role: string | null | undefined
}): boolean {
  return input.role === 'admin' || input.role === 'concierge'
}

function room_has_line_initial_or_ack(archived_messages: archived_message[]) {
  return archived_messages.some((row) => {
    const bundle = row.bundle

    if (
      bundle.bundle_type === 'welcome' ||
      bundle.bundle_type === 'initial_carousel'
    ) {
      return true
    }

    if (
      bundle.sender === 'bot' &&
      bundle.bundle_type === 'text' &&
      'content_key' in bundle &&
      bundle.content_key === 'line.followup.ack'
    ) {
      return true
    }

    return false
  })
}

/**
 * Seed welcome + carousel when the room has no bot initial seed yet.
 * Incoming user rows alone must not block the first LINE reply.
 * LINE follow-up ack rows count as handled so we do not double-seed.
 */
export function should_seed_initial_messages(
  archived_messages: archived_message[],
) {
  return !room_has_line_initial_or_ack(archived_messages)
}

export type chat_message_rule_action =
  | {
      action: 'switch_room_mode'
      mode: room_mode
    }
  | {
      action: 'none'
    }

export function resolve_chat_message_action(
  bundle: message_bundle,
): chat_message_rule_action {
  if (bundle.bundle_type !== 'text') {
    return { action: 'none' }
  }

  const metadata =
    'metadata' in bundle &&
    bundle.metadata &&
    typeof bundle.metadata === 'object'
      ? bundle.metadata
      : null

  if (metadata?.intent !== 'switch_mode') {
    return { action: 'none' }
  }

  if (metadata.mode === 'bot' || metadata.mode === 'concierge') {
    return {
      action: 'switch_room_mode',
      mode: metadata.mode,
    }
  }

  return { action: 'none' }
}

/**
 * Cross-locale switch-mode keyword list.
 * Single source of truth for both LINE and Web chat triggers.
 * Do not duplicate this in React components or UI layers.
 */
const switch_mode_words: Record<room_mode, string[]> = {
  concierge: [
    'concierge',
    'コンシェルジュ',
    '担当者',
    '人に相談',
    '人と話す',
    'オペレーター',
    '有人',
  ],
  bot: [
    'bot',
    'ボット',
    'ぼっと',
    '自動応答',
    'ai',
    'AI',
  ],
}

/**
 * Short phrase patterns (matched after normalization) that imply a transition.
 * Anchor each side so we do not accidentally match unrelated longer text.
 */
const switch_mode_phrases: Record<room_mode, RegExp[]> = {
  concierge: [
    /^コンシェルジュ(に切り替え(て)?|にする|に変更|に戻す|に切替|に変える|に繋いで|につないで)$/,
    /^(担当者|オペレーター|有人)(に切り替え(て)?|にする|に変更|に繋いで|につないで|に相談)$/,
    /^switch\s+to\s+concierge$/,
  ],
  bot: [
    /^ボット(に切り替え(て)?|にする|に変更|に戻す|に切替|に変える)$/,
    /^自動応答(に切り替え(て)?|にする|に変更|に戻す|に切替|に変える)$/,
    /^switch\s+to\s+bot$/,
  ],
}

/**
 * Normalize incoming text so detection is locale-agnostic:
 * - trim outer whitespace
 * - convert full-width spaces / digits / katakana to normal width via NFKC
 * - collapse whitespace runs to a single space
 * - lowercase (Japanese is unaffected)
 */
function normalize_trigger_text(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/[\u3000\s]+/g, ' ')
    .toLowerCase()
}

const normalized_switch_mode_words: Record<room_mode, string[]> = {
  concierge: switch_mode_words.concierge.map(normalize_trigger_text),
  bot: switch_mode_words.bot.map(normalize_trigger_text),
}

/**
 * Locale-agnostic switch-mode detector.
 * Returns the target room_mode if the user message asks to switch,
 * otherwise null. Used by chat/action.ts for both LINE and Web flows.
 */
export function detect_switch_mode(text: string): room_mode | null {
  if (typeof text !== 'string' || text.length === 0) {
    return null
  }

  const normalized = normalize_trigger_text(text)

  if (normalized.length === 0) {
    return null
  }

  for (const mode of ['concierge', 'bot'] as const) {
    if (normalized_switch_mode_words[mode].includes(normalized)) {
      return mode
    }
  }

  for (const mode of ['concierge', 'bot'] as const) {
    if (switch_mode_phrases[mode].some((pattern) => pattern.test(normalized))) {
      return mode
    }
  }

  return null
}

/**
 * Channel-agnostic chat-text mode switch detector.
 * Locale parameter is accepted for API compatibility but no longer
 * affects detection (all keywords are matched across languages).
 */
export function resolve_text_mode_switch(input: {
  text: string
  locale?: chat_locale
}): room_mode | null {
  void input.locale
  return detect_switch_mode(input.text)
}

/**
 * Whether end-user chat bubbles should render `room_action_log` bundles.
 * Decided in rules only; UI must not branch on content_key.
 */
export function end_user_should_see_room_action_log_bundle(): boolean {
  return false
}
