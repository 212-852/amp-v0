import { normalize_locale, type locale_key } from '@/lib/locale/action'

export type chat_typing_label_key = 'user_typing' | 'staff_typing'

type locale_row = Record<locale_key, string>

const content = {
  user_typing: {
    ja: 'ユーザー入力中',
    en: 'User is typing',
    es: 'El usuario está escribiendo',
  },
  staff_typing: {
    ja: 'スタッフ入力中',
    en: 'Staff is typing',
    es: 'El personal está escribiendo',
  },
} satisfies Record<chat_typing_label_key, locale_row>

function pick_locale_row(row: locale_row, locale: locale_key): string {
  const primary = row[locale]?.trim()

  if (primary) {
    return primary
  }

  const ja = row.ja.trim()

  if (ja) {
    return ja
  }

  return row.en
}

export function pick_chat_typing_label(
  key: chat_typing_label_key,
  locale: string | null | undefined,
): string {
  return pick_locale_row(content[key], normalize_locale(locale))
}
