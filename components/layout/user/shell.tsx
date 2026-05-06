'use client'

import { ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import {
  useEffect,
  useRef,
} from 'react'

import UserFooter from '@/components/layout/user/footer'
import UserHeader from '@/components/layout/user/header'

type UserShellProps = {
  children: React.ReactNode
}

export default function UserShell({ children }: UserShellProps) {
  const scroll_container_ref = useRef<HTMLElement | null>(null)
  const pathname = usePathname()

  function scroll_to_bottom(behavior: ScrollBehavior) {
    const scroll_container = scroll_container_ref.current

    if (!scroll_container) {
      return
    }

    scroll_container.scrollTo({
      top: scroll_container.scrollHeight,
      behavior,
    })
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      scroll_to_bottom('auto')
    })

    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  return (
    <div className="min-h-[100dvh] bg-[#f6e5cf]">
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-x-hidden bg-[#f6e5cf]">
        <div className="fixed left-0 right-0 top-0 z-50 w-screen">
          <div className="mx-auto w-full max-w-[430px]">
            <UserHeader />
          </div>
        </div>

        <main
          ref={scroll_container_ref}
          className="min-h-0 flex-1 overflow-y-auto px-0 pt-[calc(env(safe-area-inset-top)+78px)] pb-[calc(220px+env(safe-area-inset-bottom,0px))]"
        >
          {children}
        </main>

        <div className="pointer-events-none fixed inset-x-0 top-[96px] z-40 mx-auto w-full max-w-[430px] px-4">
          <div className="flex justify-end">
            <button
              type="button"
              aria-label="Scroll to bottom"
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-[#e8cdb5] bg-[#fffaf3] text-[#3a2a21] shadow-[0_6px_18px_rgba(155,107,75,0.18)] transition-transform active:scale-95"
              onClick={() => scroll_to_bottom('smooth')}
            >
              <ChevronDown
                className="h-5 w-5"
                strokeWidth={2.4}
              />
            </button>
          </div>
        </div>

        <UserFooter />
      </div>
    </div>
  )
}
