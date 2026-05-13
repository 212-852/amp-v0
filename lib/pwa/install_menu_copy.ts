import { resolve_pwa_install_client_os } from '@/lib/pwa/rules'

export type pwa_install_menu_copy_variant = 'standard' | 'safari_manual'

/** Single source for PWA install row / modal header copy (JP). */
export const pwa_install_menu_row_copy = {
  standard: {
    title: 'アプリをインストール',
    subtitle: 'ホーム画面に追加して通知を受け取る',
  },
  safari_manual: {
    title: 'アプリをホーム画面に追加',
    subtitle: 'Safariの共有ボタンから追加してください',
  },
  installed_label: 'インストール済み',
} as const

/**
 * rules: which primary/subtitle pair the install menu row shows.
 * Does not decide tier or standalone; callers pass `has_beforeinstallprompt` and UA.
 */
export function is_ios_like_user_agent(user_agent: string | null | undefined): boolean {
  return resolve_pwa_install_client_os(user_agent) === 'ios'
}

export function resolve_pwa_install_menu_copy_variant(input: {
  has_beforeinstallprompt: boolean
  user_agent: string | null | undefined
}): pwa_install_menu_copy_variant {
  if (input.has_beforeinstallprompt) {
    return 'standard'
  }

  if (is_ios_like_user_agent(input.user_agent)) {
    return 'safari_manual'
  }

  return 'standard'
}
