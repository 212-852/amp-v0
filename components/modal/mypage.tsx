'use client'

import { X } from 'lucide-react'

import type { locale_key } from '@/lib/locale/action'

type mypage_modal_props = {
  locale: locale_key
  on_close: () => void
}

const content = {
  title: {
    ja: 'マイページ',
    en: 'My Page',
    es: 'Mi pagina',
  },
  description: {
    ja: '予約やアカウント情報を確認できます。',
    en: 'Check reservations and account details.',
    es: 'Consulta reservas y datos de la cuenta.',
  },
}

export default function MypageModal(props: mypage_modal_props) {
  return (
    <div className="w-full max-w-[430px] rounded-t-[34px] bg-[#fdfaf8] px-7 pb-[calc(env(safe-area-inset-bottom,0px)+28px)] pt-7 shadow-[0_-12px_40px_rgba(42,29,24,0.08)]">
      <div className="flex items-start justify-between gap-3">
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
    </div>
  )
}
