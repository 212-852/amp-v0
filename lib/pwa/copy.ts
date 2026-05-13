import type { pwa_install_client_os } from '@/lib/pwa/rules'

export type pwa_install_modal_panel_copy = {
  title: string
  body: string
  steps: readonly string[] | null
  primary_button_label: string | null
  android_chrome_install_hint: string | null
  close_label: string
}

const pwa_install_modal_close_label = '閉じる' as const

const pwa_install_modal_ios_steps = [
  'Safariでこのページを開く',
  '共有ボタンを押す',
  '「ホーム画面に追加」を選ぶ',
  '追加を押す',
] as const

/**
 * Pure copy + layout fields for the PWA install modal (JP).
 * Callers pass OS from rules and client flags; no UA parsing here.
 */
export function resolve_pwa_install_modal_panel_copy(input: {
  client_os: pwa_install_client_os
  standalone: boolean
  has_before_install_prompt: boolean
}): pwa_install_modal_panel_copy {
  const close_label = pwa_install_modal_close_label

  if (input.standalone) {
    return {
      title: 'インストール済み',
      body: 'この端末にはすでにアプリが追加されています。',
      steps: null,
      primary_button_label: null,
      android_chrome_install_hint: null,
      close_label,
    }
  }

  if (input.client_os === 'ios') {
    return {
      title: 'アプリをホーム画面に追加',
      body: 'iPhoneでは、Safariの共有ボタンから「ホーム画面に追加」を選択してください。',
      steps: pwa_install_modal_ios_steps,
      primary_button_label: null,
      android_chrome_install_hint: null,
      close_label,
    }
  }

  if (input.client_os === 'android') {
    const shared: Pick<
      pwa_install_modal_panel_copy,
      'title' | 'body' | 'steps' | 'close_label'
    > = {
      title: 'アプリをインストール',
      body: 'Androidでは、この画面からアプリとしてインストールできます。',
      steps: null,
      close_label,
    }

    if (input.has_before_install_prompt) {
      return {
        ...shared,
        primary_button_label: 'インストールする',
        android_chrome_install_hint: null,
      }
    }

    return {
      ...shared,
      primary_button_label: null,
      android_chrome_install_hint:
        'Chromeのメニューから「アプリをインストール」を選んでください。',
    }
  }

  return {
    title: 'アプリをインストール',
    body: 'Chromeのアドレスバーまたはメニューからアプリをインストールできます。',
    steps: null,
    primary_button_label: null,
    android_chrome_install_hint: null,
    close_label,
  }
}
