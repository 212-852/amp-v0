import type { locale_key } from '@/lib/locale/action'

type label_block = Record<locale_key, string>

const segment_labels: Record<string, label_block> = {
  root: {
    ja: 'ホーム',
    en: 'HOME',
    es: 'Inicio',
  },
  user: {
    ja: 'ホーム',
    en: 'HOME',
    es: 'Inicio',
  },
  contact: {
    ja: 'お問い合わせ',
    en: 'CONTACT',
    es: 'Contacto',
  },
  liff: {
    ja: 'LINE',
    en: 'LINE',
    es: 'LINE',
  },
  driver: {
    ja: 'ドライバー',
    en: 'DRIVER',
    es: 'Conductor',
  },
  admin: {
    ja: '管理',
    en: 'ADMIN',
    es: 'Admin',
  },
}

function title_case_en(segment: string) {
  return segment
    .split('-')
    .map((part) =>
      part.length > 0
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part,
    )
    .join(' ')
    .toUpperCase()
}

function fallback_segment_label(
  segment: string,
  locale: locale_key,
) {
  if (locale === 'en') {
    return title_case_en(segment)
  }

  return segment.replace(/-/g, ' ')
}

export function label_for_segment(
  segment: string,
  locale: locale_key,
): string | null {
  const block = segment_labels[segment]

  if (!block) {
    return null
  }

  return block[locale] ?? block.ja
}

export function resolve_segment_label(
  segment: string,
  locale: locale_key,
) {
  return (
    label_for_segment(segment, locale) ??
    fallback_segment_label(segment, locale)
  )
}
