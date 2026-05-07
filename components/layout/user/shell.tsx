'use client'

import { ChevronDown } from 'lucide-react'

import {
  UserChatProvider,
  useUserChat,
} from '@/components/chat/context'
import UserFooter from '@/components/user/footer'
import UserHeader from '@/components/user/header'

type UserShellProps = {
  children: React.ReactNode
}

function ScrollToBottomButton() {
  const { scroll_to_bottom } = useUserChat()

  return (
    <button
      type="button"
      aria-label="Scroll to bottom"
      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-[#e8cdb5] bg-[#fffaf3] text-[#3a2a21] shadow-[0_6px_18px_rgba(155,107,75,0.18)] transition-transform active:scale-95"
      onClick={() => scroll_to_bottom('smooth')}
    >
      <ChevronDown className="h-5 w-5" strokeWidth={2.4} />
    </button>
  )
}

export default function UserShell({ children }: UserShellProps) {
  return (
    <div className="min-h-[100dvh] bg-[#f6e5cf]">
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-x-hidden bg-[#f6e5cf]">
        <div className="fixed left-0 right-0 top-0 z-50 w-screen">
          <div className="mx-auto w-full max-w-[430px]">
            <UserHeader />
          </div>
        </div>

        <UserChatProvider>
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-0 pt-[calc(env(safe-area-inset-top)+78px)] pb-[calc(220px+env(safe-area-inset-bottom,0px))]">
            {children}
          </main>

          <div className="pointer-events-none fixed inset-x-0 top-[96px] z-40 mx-auto w-full max-w-[430px] px-4">
            <div className="flex justify-end">
              <ScrollToBottomButton />
            </div>
          </div>

          <UserFooter />
        </UserChatProvider>
      </div>
    </div>
  )
}
