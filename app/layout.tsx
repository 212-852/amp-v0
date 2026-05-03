import type { Metadata } from 'next'
import { M_PLUS_Rounded_1c } from 'next/font/google'
import './globals.css'
import UserFooter from '@/components/layout/user/footer'
import UserHeader from '@/components/layout/user/header'

const rounded = M_PLUS_Rounded_1c({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-rounded',
})

export const metadata: Metadata = {
  title: 'PET TAXI',
  description: 'Pet taxi reservation assistant',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className={rounded.variable}>
        <div className="min-h-[100dvh] bg-[#f6e5cf]">
          <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-x-hidden bg-[#f6e5cf]">
            <div className="fixed inset-x-0 top-0 z-50 mx-auto w-full max-w-[430px]">
              <UserHeader />
            </div>

            <main className="min-h-0 flex-1 overflow-y-auto px-0 pt-[calc(env(safe-area-inset-top)+78px)] pb-[126px]">
              {children}
            </main>

            <UserFooter />
          </div>
        </div>
      </body>
    </html>
  )
}
