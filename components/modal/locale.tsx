'use client'

import { X } from 'lucide-react'
import { FaPaw } from 'react-icons/fa'

import { locale_values, type locale_key } from '@/lib/locale/action'

type LocaleModalProps = {
  locale: locale_key
  on_select: (locale: locale_key) => void
  on_close: () => void
}

const content = {
  title: {
    ja: '表示言語',
    en: 'Language',
    es: 'Idioma',
  },
}

const options = {
  ja: {
    name: '日本語',
    label: 'JA',
  },
  en: {
    name: 'English',
    label: 'EN',
  },
  es: {
    name: 'Español',
    label: 'ES',
  },
}

export default function LocaleModal({
  locale,
  on_select,
  on_close,
}: LocaleModalProps) {
  return (
    <div
      className="
        relative
        w-[92%] max-w-[420px]
        rounded-[34px]
        bg-[#fdfaf8]
        px-7 py-7
        shadow-[0_12px_40px_rgba(42,29,24,0.08)]
      "
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[21px] font-semibold leading-[1.45] text-[#2a1d18]">
          {content.title[locale]}
        </h2>

        <button
          type="button"
          onClick={on_close}
          aria-label="close"
          className="
            flex h-[38px] w-[38px]
            shrink-0
            items-center justify-center
            rounded-full
            transition-transform
            active:scale-[0.94]
          "
        >
          <X className="h-[24px] w-[24px] stroke-[2.1] text-[#2a1d18]" />
        </button>
      </div>

      <div className="mt-6 space-y-3.5">
        {locale_values.map((value) => {
          const selected = value === locale

          return (
            <button
              key={value}
              type="button"
              onClick={() => on_select(value)}
              className={`
                flex min-h-[68px] w-full
                items-center justify-between
                rounded-[26px]
                border
                px-5
                py-3
                transition-colors
                active:scale-[0.98]
                hover:bg-[#fffaf6]
                ${
                  selected
                    ? 'border-[#d8b89c] bg-[#fff7f0]'
                    : 'border-[#ead8c8] bg-white'
                }
              `}
            >
              <span className="text-[15px] font-medium leading-[1.5] text-[#2a1d18]">
                {options[value].name}
              </span>

              <span className="flex items-center gap-2 text-[12px] font-semibold leading-none text-[#8a7568]">
                {options[value].label}
                {selected ? (
                  <FaPaw
                    className="
                      h-[14px] w-[14px]
                      text-[#d9899c]
                      opacity-95
                    "
                  />
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
