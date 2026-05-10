'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type AdminHeaderMenuProps = {
  can_access_management: boolean
}

const icon_button_class =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-black shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 active:scale-[0.98] sm:h-11 sm:w-11'

export default function AdminHeaderMenu({
  can_access_management,
}: AdminHeaderMenuProps) {
  const [is_open, set_is_open] = useState(false)
  const root_ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!is_open) {
      return
    }

    const handle_pointer_down = (event: PointerEvent) => {
      const root = root_ref.current

      if (!root || root.contains(event.target as Node)) {
        return
      }

      set_is_open(false)
    }

    window.addEventListener('pointerdown', handle_pointer_down)

    return () => {
      window.removeEventListener('pointerdown', handle_pointer_down)
    }
  }, [is_open])

  return (
    <div ref={root_ref} className="relative">
      <button
        type="button"
        className={icon_button_class}
        aria-label="Admin menu"
        aria-expanded={is_open}
        onClick={() => set_is_open((current) => !current)}
      >
        <ChevronDown className="h-5 w-5" strokeWidth={2} />
      </button>

      {is_open ? (
        <div className="absolute right-0 top-full z-[160] mt-2 min-w-44 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
          {can_access_management ? (
            <Link
              href="/admin/management"
              className="block rounded-xl px-3 py-2 text-[13px] font-semibold text-black transition-colors hover:bg-neutral-100"
              onClick={() => set_is_open(false)}
            >
              運営者管理
            </Link>
          ) : (
            <div className="px-3 py-2 text-[12px] font-medium text-neutral-400">
              メニューはありません
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
