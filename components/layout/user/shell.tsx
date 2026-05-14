'use client'

import { ChevronDown } from 'lucide-react'

import {
  UserChatProvider,
  useUserChat,
} from '@/components/chat/context'
import { PwaBootProvider } from '@/components/pwa/boot_gate'
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
      aria-label="Scroll to latest message"
      className="pointer-events-auto absolute right-4 top-[calc(env(safe-area-inset-top)+88px)] z-[999] flex h-10 w-10 items-center justify-center rounded-full border border-[#e8cdb5] bg-white text-[#3a2a21] shadow-[0_6px_18px_rgba(155,107,75,0.18)] transition-transform active:scale-95"
      onClick={() => scroll_to_bottom('smooth')}
    >
      <ChevronDown className="h-5 w-5" strokeWidth={2.4} />
    </button>
  )
}

export default function UserShell({ children }: UserShellProps) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-[#f6e5cf]">
      <div className="relative mx-auto flex h-[100dvh] min-h-0 w-full max-w-[430px] flex-col overflow-hidden bg-[#f6e5cf]">
        <PwaBootProvider>
          <div className="fixed left-0 right-0 top-0 z-50 w-screen">
            <div className="mx-auto w-full max-w-[430px]">
              <UserHeader />
            </div>
          </div>

          <UserChatProvider>
            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-0 pt-[calc(env(safe-area-inset-top)+78px)]">
              <ScrollToBottomButton />
              {children}
            </main>

            <UserFooter />
          </UserChatProvider>
        </PwaBootProvider>
      </div>
    </div>
  )
}
