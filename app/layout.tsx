import type { Metadata, Viewport } from 'next'
import { M_PLUS_Rounded_1c } from 'next/font/google'
import './globals.css'
import LiffBootstrapLoader from '@/components/session/liff/loader'
import PwaBootstrap from '@/components/pwa/bootstrap'
import PwaLinkReturnProbe from '@/components/pwa/link_return_probe'

const rounded = M_PLUS_Rounded_1c({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-rounded',
})

export const metadata: Metadata = {
  title: 'PET TAXI',
  description: 'Pet taxi reservation assistant',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#ead5c0',
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
        <PwaBootstrap />
        <PwaLinkReturnProbe />
        {children}
      </body>
    </html>
  )
}
