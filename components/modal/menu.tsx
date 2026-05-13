'use client'

import { X } from 'lucide-react'

import PwaInstallButton from '@/components/pwa/install'
import type { locale_key } from '@/lib/locale/action'
import { can_show_pwa_install } from '@/lib/pwa/rules'

type menu_modal_props = {
  locale: locale_key
  on_close: () => void
  session: {
    user_uuid?: string | null
    role?: 'user' | 'driver' | 'admin' | 'guest' | null
    tier?: 'guest' | 'member' | 'vip' | null
    pwa_installed?: boolean
  } | null
  room_uuid: string | null
  participant_uuid: string | null
}

const content = {
  title: {
    ja: 'メニュー',
    en: 'Menu',
    es: 'Menu',
  },
  description: {
    ja: '各種設定やサポート項目を確認できます。',
    en: 'Check settings and support items.',
    es: 'Consulta ajustes y opciones de soporte.',
  },
}

export default function MenuModal(props: menu_modal_props) {
  const can_install = can_show_pwa_install({
    role: props.session?.role ?? null,
    tier: props.session?.tier ?? null,
    already_installed: Boolean(props.session?.pwa_installed),
  })

  return (
    <div className="flex h-full min-h-dvh w-[86%] max-w-[360px] flex-col bg-[#fdfaf8] px-7 pb-7 pt-[calc(env(safe-area-inset-top,0px)+28px)] shadow-[12px_0_40px_rgba(42,29,24,0.08)]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 pr-1">
            <h2 className="text-[21px] font-semibold leading-[1.45] text-[#2a1d18]">
              {content.title[props.locale]}
            </h2>

            <p className="mt-3 text-[14px] font-normal leading-[1.75] text-[#6d5c52]">
              {content.description[props.locale]}
            </p>
          </div>

          <button
            type="button"
            onClick={props.on_close}
            aria-label="close"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
          >
            <X className="h-[24px] w-[24px] stroke-[2.1] text-[#2a1d18]" />
          </button>
        </div>

        <div className="mt-auto w-full shrink-0 pt-6">
          <PwaInstallButton
            can_install={can_install}
            user_uuid={props.session?.user_uuid ?? null}
            participant_uuid={props.participant_uuid}
            room_uuid={props.room_uuid}
            role={props.session?.role ?? null}
            tier={props.session?.tier ?? null}
          />
        </div>
      </div>
    </div>
  )
}
