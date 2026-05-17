import 'server-only'

import {
  recruitment_apply_path,
  recruitment_entry_path,
} from '@/lib/recruitment/content'

export type recruitment_intent = 'driver_recruitment'

function normalize_dispatch_text(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ') ?? ''
}

const DRIVER_RECRUITMENT_KEYWORDS = [
  'ドライバー',
  'ドライバー募集',
  '求人',
  '働きたい',
  'エントリー',
  '配送したい',
  'ペットタクシーのドライバー',
  '応募したい',
] as const

const normalized_keywords = DRIVER_RECRUITMENT_KEYWORDS.map((keyword) =>
  normalize_recruitment_text(keyword),
)

function normalize_recruitment_text(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .replace(/[\u3000\s]+/g, ' ')
    .toLowerCase()
}

export function detect_driver_recruitment_intent(
  text: string | null | undefined,
): recruitment_intent | null {
  const normalized = normalize_recruitment_text(
    normalize_dispatch_text(text),
  )

  if (!normalized) {
    return null
  }

  if (normalized_keywords.some((keyword) => normalized.includes(keyword))) {
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
