import { normalize_locale, type locale_key } from '@/lib/locale/action'

import type { pwa_install_menu_copy_variant } from '@/lib/pwa/install_menu_copy'
import type { pwa_install_client_os } from '@/lib/pwa/rules'

type locale_row = Record<locale_key, string>

function pick(row: locale_row, locale: locale_key): string {
  return row[locale]
}

/**
 * Single bundle for PWA install menu + modal copy (ja / en / es).
 * UI reads resolved strings only; do not branch on locale in components.
 */
const content = {
  menu_standard_title: {
    ja: 'アプリをインストール',
    en: 'Install the app',
    es: 'Instalar la app',
  },
  menu_standard_subtitle: {
    ja: 'ホーム画面に追加して通知を受け取る',
    en: 'Add to Home Screen to receive notifications',
    es: 'Anade a la pantalla de inicio para recibir notificaciones',
  },
  menu_safari_title: {
    ja: 'アプリをホーム画面に追加',
    en: 'Add app to Home Screen',
    es: 'Anadir la app a la pantalla de inicio',
  },
  menu_safari_subtitle: {
    ja: 'Safariの共有ボタンから追加してください',
    en: 'Use Safari Share, then choose Add to Home Screen',
    es: 'En Safari, Compartir y elige Anadir a la pantalla de inicio',
  },
  menu_installed_title: {
    ja: 'インストール済み',
    en: 'Installed',
    es: 'Instalada',
  },
  menu_badge_pwa: {
    ja: 'PWA',
    en: 'PWA',
    es: 'PWA',
  },
  modal_installed_title: {
    ja: 'インストール済み',
    en: 'Installed',
    es: 'Instalada',
  },
  modal_installed_body: {
    ja: 'この端末にはすでにアプリが追加されています。',
    en: 'This app is already added on this device.',
    es: 'Esta app ya esta anadida en este dispositivo.',
  },
  modal_ios_title: {
    ja: 'アプリをホーム画面に追加',
    en: 'Add app to Home Screen',
    es: 'Anadir la app a la pantalla de inicio',
  },
  modal_ios_body: {
    ja: 'iPhoneでは、Safariの共有ボタンから「ホーム画面に追加」を選択してください。',
    en: 'On iPhone, open Safari, tap Share, then choose Add to Home Screen.',
    es: 'En iPhone, abre Safari, pulsa Compartir y elige Anadir a la pantalla de inicio.',
  },
  modal_ios_step_1: {
    ja: 'Safariでこのページを開く',
    en: 'Open this page in Safari',
    es: 'Abre esta pagina en Safari',
  },
  modal_ios_step_2: {
    ja: '共有ボタンを押す',
    en: 'Tap the Share button',
    es: 'Pulsa el boton Compartir',
  },
  modal_ios_step_3: {
    ja: '「ホーム画面に追加」を選ぶ',
    en: 'Choose Add to Home Screen',
    es: 'Elige Anadir a la pantalla de inicio',
  },
  modal_ios_step_4: {
    ja: '追加を押す',
    en: 'Tap Add',
    es: 'Pulsa Anadir',
  },
  modal_android_title: {
    ja: 'アプリをインストール',
    en: 'Install the app',
    es: 'Instalar la app',
  },
  modal_android_body: {
    ja: 'Androidでは、この画面からアプリとしてインストールできます。',
    en: 'On Android, you can install this experience as an app from this screen.',
    es: 'En Android puedes instalar esta experiencia como app desde esta pantalla.',
  },
  modal_android_install_button: {
    ja: 'インストールする',
    en: 'Install',
    es: 'Instalar',
  },
  modal_android_chrome_hint: {
    ja: 'Chromeのメニューから「アプリをインストール」を選んでください。',
    en: 'From the Chrome menu, choose Install app.',
    es: 'En el menu de Chrome, elige Instalar app.',
  },
  modal_desktop_title: {
    ja: 'アプリをインストール',
    en: 'Install the app',
    es: 'Instalar la app',
  },
  modal_desktop_body: {
    ja: 'Chromeのアドレスバーまたはメニューからアプリをインストールできます。',
    en: 'You can install the app from the Chrome address bar or menu.',
    es: 'Puedes instalar la app desde la barra de direcciones o el menu de Chrome.',
  },
  modal_close_label: {
    ja: '閉じる',
    en: 'Close',
    es: 'Cerrar',
  },
  modal_close_aria: {
    ja: '閉じる',
    en: 'Close',
    es: 'Cerrar',
  },
} as const satisfies Record<string, locale_row>

export type pwa_install_modal_panel_copy = {
  title: string
  body: string
  steps: readonly string[] | null
  primary_button_label: string | null
  android_chrome_install_hint: string | null
  close_label: string
  close_aria_label: string
  installed_badge_label: string
}

/**
 * Prefer the active UI locale prop; if missing, fall back to AMP session locale.
 * Unknown codes normalize to ja with fallback_used true.
 */
export function resolve_pwa_install_ui_locale(input: {
  session_locale: string | null | undefined
  client_locale_fallback: string | null | undefined
}): { locale: locale_key; fallback_used: boolean } {
  const trimmed_client = input.client_locale_fallback?.trim()

  if (trimmed_client) {
    const lower = trimmed_client.toLowerCase()
    const known =
      lower.startsWith('ja') ||
      lower.startsWith('en') ||
      lower.startsWith('es')

    return {
      locale: normalize_locale(trimmed_client),
      fallback_used: !known,
    }
  }

  const trimmed_session = input.session_locale?.trim()

  if (trimmed_session) {
    const lower = trimmed_session.toLowerCase()
    const known =
      lower.startsWith('ja') ||
      lower.startsWith('en') ||
      lower.startsWith('es')

    return {
      locale: normalize_locale(trimmed_session),
      fallback_used: !known,
    }
  }

  return { locale: 'ja', fallback_used: true }
}

export function resolve_pwa_install_menu_labels(input: {
  locale: locale_key
  variant: pwa_install_menu_copy_variant
  installed: boolean
}): { title: string; subtitle: string | null; badge_label: string } {
  const badge_label = pick(content.menu_badge_pwa, input.locale)

  if (input.installed) {
    return {
      title: pick(content.menu_installed_title, input.locale),
      subtitle: null,
      badge_label,
    }
  }

  if (input.variant === 'safari_manual') {
    return {
      title: pick(content.menu_safari_title, input.locale),
      subtitle: pick(content.menu_safari_subtitle, input.locale),
      badge_label,
    }
  }

  return {
    title: pick(content.menu_standard_title, input.locale),
    subtitle: pick(content.menu_standard_subtitle, input.locale),
    badge_label,
  }
}

/**
 * Pure copy for the PWA install modal. Callers pass OS from rules and client flags.
 */
export function resolve_pwa_install_modal_panel_copy(input: {
  locale: locale_key
  client_os: pwa_install_client_os
  standalone: boolean
  has_before_install_prompt: boolean
}): pwa_install_modal_panel_copy {
  const close_label = pick(content.modal_close_label, input.locale)
  const close_aria_label = pick(content.modal_close_aria, input.locale)
  const installed_badge_label = pick(content.menu_badge_pwa, input.locale)

  if (input.standalone) {
    return {
      title: pick(content.modal_installed_title, input.locale),
      body: pick(content.modal_installed_body, input.locale),
      steps: null,
      primary_button_label: null,
      android_chrome_install_hint: null,
      close_label,
      close_aria_label,
      installed_badge_label,
    }
  }

  if (input.client_os === 'ios') {
    const steps = [
      pick(content.modal_ios_step_1, input.locale),
      pick(content.modal_ios_step_2, input.locale),
      pick(content.modal_ios_step_3, input.locale),
      pick(content.modal_ios_step_4, input.locale),
    ] as const

    return {
      title: pick(content.modal_ios_title, input.locale),
      body: pick(content.modal_ios_body, input.locale),
      steps,
      primary_button_label: null,
      android_chrome_install_hint: null,
      close_label,
      close_aria_label,
      installed_badge_label,
    }
  }

  if (input.client_os === 'android') {
    const shared: Pick<
      pwa_install_modal_panel_copy,
      'title' | 'body' | 'steps' | 'close_label' | 'close_aria_label' | 'installed_badge_label'
    > = {
      title: pick(content.modal_android_title, input.locale),
      body: pick(content.modal_android_body, input.locale),
      steps: null,
      close_label,
      close_aria_label,
      installed_badge_label,
    }

    if (input.has_before_install_prompt) {
      return {
        ...shared,
        primary_button_label: pick(
          content.modal_android_install_button,
          input.locale,
        ),
        android_chrome_install_hint: null,
      }
    }

    return {
      ...shared,
      primary_button_label: null,
      android_chrome_install_hint: pick(
        content.modal_android_chrome_hint,
        input.locale,
      ),
    }
  }

  return {
    title: pick(content.modal_desktop_title, input.locale),
    body: pick(content.modal_desktop_body, input.locale),
    steps: null,
    primary_button_label: null,
    android_chrome_install_hint: null,
    close_label,
    close_aria_label,
    installed_badge_label,
  }
}
