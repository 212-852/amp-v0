'use client'

import { X } from 'lucide-react'

import QuickMenuCards from '@/components/shared/quick/cards'
import type {
  quick_menu_item,
  quick_menu_item_key,
} from '@/components/shared/quick/cards'
import type { locale_key } from '@/lib/locale/action'

type quick_modal_props = {
  locale: locale_key
  items: quick_menu_item[]
  on_close: () => void
  on_select: (item_key: quick_menu_item_key) => void
}

const content = {
  title: {
    ja: 'クイックメニュー',
    en: 'Quick Menu',
    es: 'Menu rapido',
  },
}

export default function QuickModal(props: quick_modal_props) {
  return (
    <div className="relative w-[92%] max-w-[420px] overflow-hidden rounded-[34px] bg-[#fdfaf8] px-7 py-7 shadow-[0_12px_40px_rgba(42,29,24,0.08)]">
      <div className="animate-[modal_in_220ms_ease-out_both]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pr-1">
            <h2 className="text-[21px] font-semibold tracking-[-0.01em] leading-[1.45] text-[#2a1d18]">
              {content.title[props.locale]}
            </h2>
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

        <div className="-mx-7 mt-5">
          <QuickMenuCards
            locale={props.locale}
            items={props.items}
            on_select={props.on_select}
          />
        </div>
      </div>
    </div>
  )
}
