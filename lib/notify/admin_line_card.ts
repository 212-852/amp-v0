import 'server-only'

import type { locale_key } from '@/lib/locale/action'

export const admin_line_guest_display_fallback = 'Guest User'

const admin_line_message_preview_max = 900

const admin_line_title: Record<locale_key, (display_name: string) => string> = {
  ja: (display_name) => `${display_name} \u3055\u3093\u304b\u3089\u65b0\u3057\u3044\u30e1\u30c3\u30bb\u30fc\u30b8`,
  en: (display_name) => `New message from ${display_name}`,
  es: (display_name) => `Nuevo mensaje de ${display_name}`,
}

const admin_line_cta_label: Record<locale_key, string> = {
  ja: '\u30c1\u30e3\u30c3\u30c8\u3092\u958b\u304f',
  en: 'Open chat',
  es: 'Abrir chat',
}

export function truncate_admin_line_message_preview(
  message: string,
  max = admin_line_message_preview_max,
): string {
  const cleaned = message.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()

  if (!cleaned) {
    return ''
  }

  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}\u2026` : cleaned
}

export function resolve_admin_line_notification_copy(input: {
  locale: locale_key
  sender_display_name: string | null
  message_text: string
}): {
  title: string
  body: string
  display_name: string
  latest_message_preview: string
  cta_label: string
} {
  const display_name =
    typeof input.sender_display_name === 'string' &&
    input.sender_display_name.trim().length > 0
      ? input.sender_display_name.trim()
      : admin_line_guest_display_fallback

  const title = admin_line_title[input.locale](display_name)
  const body = truncate_admin_line_message_preview(input.message_text)
  const latest_message_preview =
    body.length > 0 ? body : truncate_admin_line_message_preview(input.message_text)

  return {
    title,
    body: latest_message_preview,
    display_name,
    latest_message_preview,
    cta_label: admin_line_cta_label[input.locale],
  }
}
