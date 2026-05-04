'use client'

import { createPortal } from 'react-dom'

import type { locale_key } from '@/lib/locale/action'

export type quick_overlay_item_key =
  | 'availability'
  | 'dispatch'
  | 'reservation'

export type quick_overlay_item = {
  key: quick_overlay_item_key
  title: Record<locale_key, string>
  description: Record<locale_key, string>
  label: Record<locale_key, string>
}

type quick_overlay_props = {
  open: boolean
  locale: locale_key
  items: quick_overlay_item[]
  on_close: () => void
  on_select: (item_key: quick_overlay_item_key) => void
}

export default function QuickOverlay(props: quick_overlay_props) {
  if (!props.open) {
    return null
  }

  const tree = (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <button
        type="button"
        aria-label="Close quick menu"
        className="absolute inset-0 z-0 pointer-events-auto bg-black/25 backdrop-blur-[1px]"
        onClick={props.on_close}
      />

      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+132px)] left-0 right-0 z-10 pointer-events-auto">
        <div className="mx-auto w-full max-w-[430px] overflow-hidden">
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 pt-2 [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
      </div>
    </div>
  )

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(tree, document.body)
}
