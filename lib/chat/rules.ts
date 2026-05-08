import 'server-only'

import type { archived_message } from './archive'
import type { message_bundle } from './message'
import type { room_mode } from './room'
import type { chat_locale } from './message'

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

const text_mode_switch_words: Record<chat_locale, Record<room_mode, string[]>> = {
  ja: {
    concierge: [
      'コンシェルジュ',
      'コンシェルジュに切り替え',
      '担当者',
      '人に相談',
    ],
    bot: ['ボット', 'bot', 'BOT'],
  },
  en: {
    concierge: [
      'concierge',
      'switch to concierge',
      'human',
      'agent',
    ],
    bot: ['bot', 'switch to bot'],
  },
  es: {
    concierge: ['concierge', 'humano', 'agente'],
    bot: ['bot'],
  },
}

function normalize_trigger_text(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function trigger_matches(input: {
  text: string
  word: string
  locale: chat_locale
}) {
  if (input.locale === 'ja') {
    return input.text === input.word
  }

  return input.text.toLowerCase() === input.word.toLowerCase()
}

/**
 * Channel-agnostic chat-text mode switch detector.
 * Used by both LINE webhook and Web chat input. Do not duplicate in UI.
 */
export function resolve_text_mode_switch(input: {
  text: string
  locale: chat_locale
}): room_mode | null {
  const text = normalize_trigger_text(input.text)
  const words = text_mode_switch_words[input.locale] ?? text_mode_switch_words.ja

  for (const mode of ['concierge', 'bot'] as const) {
    if (
      words[mode].some((word) =>
        trigger_matches({
          text,
          word,
          locale: input.locale,
        }),
      )
    ) {
      return mode
    }
  }

  return null
}

/**
 * @deprecated Use resolve_text_mode_switch (kept for backwards compatibility).
 */
export const resolve_line_text_mode_switch = resolve_text_mode_switch
