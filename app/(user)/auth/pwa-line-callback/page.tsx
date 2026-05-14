import { cookies } from 'next/headers'
import Link from 'next/link'

import { debug_event } from '@/lib/debug'
import { env } from '@/lib/config/env'
import { normalize_locale, type locale_key } from '@/lib/locale/action'
import { locale_cookie_name } from '@/lib/locale/cookie'

export const dynamic = 'force-dynamic'

const content = {
  completed_title: {
    ja: 'LINE連携が完了しました',
    en: 'LINE is linked',
    es: 'LINE vinculado',
  },
  completed_body: {
    ja: 'PWAアプリに戻ってください。\nアプリ側で自動確認しています。',
    en: 'Return to the PWA app.\nThe app is checking your link in the background.',
    es: 'Vuelve a la app PWA.\nLa app comprobara el enlace en segundo plano.',
  },
  completed_hint: {
    ja: '自動で戻らない場合は、ホーム画面のアプリを開いてください。',
    en: 'If you are not taken back automatically, open the app from your home screen.',
    es: 'Si no vuelves automaticamente, abre la app desde la pantalla de inicio.',
  },
  open_app: {
    ja: 'アプリに戻る',
    en: 'Back to app',
    es: 'Volver a la app',
  },
  failed_title: {
    ja: 'LINE連携に失敗しました',
    en: 'LINE link failed',
    es: 'Error al vincular LINE',
  },
  failed_body: {
    ja: 'もう一度PWAアプリから連携をお試しください。',
    en: 'Please try linking again from the PWA app.',
    es: 'Intenta vincular de nuevo desde la app PWA.',
  },
}

function resolve_app_href(): string {
  const base = env.app_url?.replace(/\/$/, '') ?? ''

  if (base.length > 0) {
    return `${base}/user`
  }

  return '/user'
}

export default async function PwaLineLinkCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>
}) {
  const params = await searchParams
  const raw = typeof params.result === 'string' ? params.result.trim() : ''

  const outcome: 'completed' | 'failed' =
    raw === 'failed' ? 'failed' : raw === 'completed' ? 'completed' : 'failed'

  const cookie_store = await cookies()
  const locale = normalize_locale(cookie_store.get(locale_cookie_name)?.value)

  await debug_event({
    category: 'pwa',
    event: 'pwa_link_callback_page_rendered',
    payload: {
      outcome,
      locale,
      phase: 'pwa_line_link_callback_landing',
    },
  })

  if (outcome === 'completed') {
    await debug_event({
      category: 'pwa',
      event: 'pwa_link_callback_completed_page_rendered',
      payload: {
        locale,
        phase: 'pwa_line_link_callback_landing',
      },
    })
  } else {
    await debug_event({
      category: 'pwa',
      event: 'pwa_link_callback_failed_page_rendered',
      payload: {
        locale,
        phase: 'pwa_line_link_callback_landing',
      },
    })
  }

  const loc = locale as locale_key
  const is_ok = outcome === 'completed'
  const title = is_ok
    ? content.completed_title[loc]
    : content.failed_title[loc]
  const body_text = is_ok
    ? content.completed_body[loc]
    : content.failed_body[loc]
  const app_href = resolve_app_href()

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-[420px] rounded-[34px] bg-[#fdfaf8] px-7 py-7 shadow-[0_12px_40px_rgba(42,29,24,0.08)]">
        <h1 className="text-[21px] font-semibold leading-[1.45] text-[#2a1d18]">
          {title}
        </h1>

        <p className="mt-4 whitespace-pre-line text-[14px] font-normal leading-[1.75] text-[#6d5c52]">
          {body_text}
        </p>

        {is_ok ? (
          <>
            <p className="mt-4 text-[12px] font-normal leading-[1.65] text-[#8a7568]">
              {content.completed_hint[loc]}
            </p>

            <Link
              href={app_href}
              className="mt-6 flex h-[54px] w-full items-center justify-center rounded-[22px] bg-[#2a1d18] px-5 text-[14px] font-semibold text-white transition-transform active:scale-[0.98]"
            >
              {content.open_app[loc]}
            </Link>
          </>
        ) : null}
      </div>
    </div>
  )
}
