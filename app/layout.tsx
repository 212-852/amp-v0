import type { Metadata } from 'next'
import { M_PLUS_Rounded_1c } from 'next/font/google'
import './globals.css'
import LiffBootstrapLoader from '@/components/session/liff/loader'

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
        <LiffBootstrapLoader />
        {children}
      </body>
    </html>
  )
}
