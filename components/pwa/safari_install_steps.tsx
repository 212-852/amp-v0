'use client'

/**
 * Shared copy for manual PWA install (Safari / LIFF) when `beforeinstallprompt` is unavailable.
 */
export function Pwa_safari_install_steps_list(props: {
  list_class_name?: string
}) {
  return (
    <ol
      className={
        props.list_class_name ??
        'mt-3 list-decimal space-y-2 pl-5 text-[13px] font-medium leading-[1.55] text-neutral-700'
      }
    >
      <li>Safari の共有ボタン</li>
      <li>「ホーム画面に追加」</li>
    </ol>
  )
}
