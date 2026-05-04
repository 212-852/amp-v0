'use client'

import type { locale_key } from '@/lib/locale/action'

export type quick_menu_item_key =
  | 'availability'
  | 'dispatch'
  | 'reservation'

export type quick_menu_item = {
  key: quick_menu_item_key
  title: Record<locale_key, string>
  description: Record<locale_key, string>
  label: Record<locale_key, string>
}

type quick_cards_props = {
  locale: locale_key
  items: quick_menu_item[]
  on_select: (item_key: quick_menu_item_key) => void
}

export default function QuickMenuCards(props: quick_cards_props) {
  return (
    <div
      className="
        overflow-x-auto px-4 pb-3
        [-webkit-overflow-scrolling:touch]
        [scrollbar-width:none]
        [&::-webkit-scrollbar]:hidden
      "
    >
      <div className="flex snap-x snap-mandatory gap-4">
        {props.items.map((item) => (
          <article
            key={item.key}
            className="min-w-[82%] snap-center rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(42,29,24,0.14)]"
          >
            <h2 className="text-[18px] font-semibold leading-[1.45] text-[#2a1d18]">
              {item.title[props.locale]}
            </h2>

            <p className="mt-2 min-h-[48px] text-[13px] font-normal leading-[1.7] text-[#6d5c52]">
              {item.description[props.locale]}
            </p>

            <button
              type="button"
              onClick={() => props.on_select(item.key)}
              className="mt-5 flex h-[46px] w-full items-center justify-center rounded-[18px] bg-[#06c755] px-4 text-[14px] font-semibold leading-none text-white shadow-[0_4px_14px_rgba(6,199,85,0.18)] transition-transform active:scale-[0.98]"
            >
              {item.label[props.locale]}
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}
