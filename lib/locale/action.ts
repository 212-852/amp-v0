export type locale_key = 'ja' | 'en' | 'es'

export const locale_values: locale_key[] = ['ja', 'en', 'es']

export function normalize_locale(
  value: string | null | undefined,
): locale_key {
  const normalized = value?.trim().toLowerCase()

  if (!normalized) {
    return 'ja'
  }

  if (normalized.startsWith('ja')) {
    return 'ja'
  }

  if (normalized.startsWith('en')) {
    return 'en'
  }

  if (normalized.startsWith('es')) {
    return 'es'
  }

  return 'ja'
}

export function get_next_locale(current_locale: string | null | undefined) {
  const locale = normalize_locale(current_locale)

  if (locale === 'ja') {
    return 'en'
  }

  if (locale === 'en') {
    return 'es'
  }

  return 'ja'
}

export async function save_locale(locale: locale_key) {
  const response = await fetch('/api/locale', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      locale,
    }),
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as { locale: locale_key }
}
