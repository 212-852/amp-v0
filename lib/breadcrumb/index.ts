import { normalize_pathname } from './context'
import { resolve_segment_label } from './rules'

import type { locale_key } from '@/lib/locale/action'

export type breadcrumb_item = {
  href: string
  label: string
}

export function build_breadcrumb(
  pathname: string,
  locale: locale_key,
): breadcrumb_item[] {
  const segments = normalize_pathname(pathname)

  if (segments.length === 0) {
    return [
      {
        href: '/',
        label: resolve_segment_label('root', locale),
      },
    ]
  }

  const items: breadcrumb_item[] = []
  const first_segment = segments[0]
  const needs_app_home_prefix = first_segment !== 'user'

  if (needs_app_home_prefix) {
    items.push({
      href: '/user',
      label: resolve_segment_label('user', locale),
    })
  }

  let accumulated = ''

  for (const segment of segments) {
    accumulated += `/${segment}`

    items.push({
      href: accumulated,
      label: resolve_segment_label(segment, locale),
    })
  }

  return items
}
