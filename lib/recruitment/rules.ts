import 'server-only'

import {
  recruitment_apply_path,
  recruitment_entry_path,
} from '@/lib/recruitment/content'
import { debug_event } from '@/lib/debug'

export type recruitment_intent = 'driver_recruitment'

function normalize_dispatch_text(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ') ?? ''
}

const DRIVER_RECRUITMENT_KEYWORDS = [
  'ドライバー',
  'ドライバー募集',
  '求人',
  '応募',
  '応募したい',
  '働きたい',
  'エントリー',
  'ペットタクシーのドライバー',
] as const

const normalized_keywords = DRIVER_RECRUITMENT_KEYWORDS.map((keyword) =>
  normalize_recruitment_text(keyword),
)

export function normalize_recruitment_text(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .replace(/[\u3000\s]+/g, ' ')
    .toLowerCase()
}

export function detect_driver_recruitment_intent(
  text: string | null | undefined,
  input?: {
    source_channel?: string | null
  },
): recruitment_intent | null {
  const normalized = normalize_recruitment_text(
    normalize_dispatch_text(text),
  )

  let matched_keyword: string | null = null

  if (!normalized) {
    void debug_event({
      category: 'recruitment',
      event: 'recruitment_intent_checked',
      payload: {
        source_channel: input?.source_channel ?? null,
        message_text: text ?? null,
        normalized_text: normalized,
        matched_keyword,
        intent: null,
        should_reply: false,
      },
    })

    return null
  }

  matched_keyword =
    normalized_keywords.find((keyword) => normalized.includes(keyword)) ?? null

  const intent = matched_keyword ? 'driver_recruitment' : null

  void debug_event({
    category: 'recruitment',
    event: 'recruitment_intent_checked',
    payload: {
      source_channel: input?.source_channel ?? null,
      message_text: text ?? null,
      normalized_text: normalized,
      matched_keyword,
      intent,
      should_reply: intent !== null,
    },
  })

  if (intent) {
    return 'driver_recruitment'
  }

  return null
}

export function resolve_recruitment_app_base_url(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '')

  return base || 'https://app.da-nya.com'
}

export function resolve_recruitment_entry_url(): string {
  return `${resolve_recruitment_app_base_url()}${recruitment_entry_path}`
}

export function resolve_recruitment_apply_url(): string {
  return `${resolve_recruitment_app_base_url()}${recruitment_apply_path}`
}
