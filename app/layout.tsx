import type { Metadata } from 'next'
import { M_PLUS_Rounded_1c } from 'next/font/google'
import './globals.css'
import UserShell from '@/components/layout/user/shell'
import LiffBootstrap from '@/components/session/liffbootstrap'

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
        <LiffBootstrap />
        <UserShell>{children}</UserShell>
      </body>
    </html>
  )
}
