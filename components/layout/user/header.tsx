'use client'

import { useEffect, useState } from 'react'
import { Bell, Globe2 } from 'lucide-react'
import Link from 'next/link'

import ConnectModal from '@/components/modal/connect'
import OverlayRoot from '@/components/overlay/root'

const content = {
  guest: {
    ja: 'ゲスト',
    en: 'Guest',
    es: 'Invitado',
  },
  connect: {
    ja: '連携',
    en: 'Connect',
    es: 'Conectar',
  },
  home: {
    ja: 'ホーム',
    en: 'Home',
    es: 'Inicio',
  },
  locale: {
    ja: 'JA',
    en: 'EN',
    es: 'ES',
  },
}

type session_response = {
  requires_line_auth?: boolean
  line_auth_method?: string | null
}

export default function UserHeader() {
  const locale = 'ja'
  const [connect_open, set_connect_open] = useState(false)

  useEffect(() => {
    fetch('/api/session', {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => response.json() as Promise<session_response>)
      .then((session) => {
        const already_redirected = sessionStorage.getItem(
          'amp_line_auth_redirected',
        )

        if (
          session.requires_line_auth &&
          session.line_auth_method === 'line_login' &&
          !already_redirected
        ) {
          sessionStorage.setItem(
            'amp_line_auth_redirected',
            'true',
          )
          window.location.href = '/api/auth/line'
        }
      })
      .catch(() => {})
  }, [])

  return (
    <>
      <header className="border-b border-[#e0cbb7] bg-[#efd7c3] px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-2.5">
        <div className="flex items-center justify-between">
          <Link
            href="/user"
            className="shrink-0 text-[17px] font-semibold tracking-[0.02em] leading-[1.35] text-[#2a1d18]"
          >
            PET TAXI
          </Link>

          <div className="flex min-w-0 translate-y-[1px] items-center gap-1.5">
            <span className="rounded-full bg-white/55 px-[11px] py-1 text-[11px] font-medium leading-[1.35] text-[#6d5c52]">
              {content.guest[locale]}
            </span>

            <button
              type="button"
              onClick={() => set_connect_open(true)}
              className="rounded-full border border-[#d3c4b8] bg-white px-[11px] py-1 text-[11px] font-medium leading-[1.35] shadow-[0_1px_3px_rgba(42,29,24,0.06)]"
            >
              {content.connect[locale]}
            </button>

            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center"
              aria-label="Notification"
            >
              <Bell className="h-[22px] w-[22px]" strokeWidth={2} />
            </button>

            <button
              type="button"
              className="flex h-8 items-center gap-0.5"
              aria-label="Language"
            >
              <Globe2 size={22} strokeWidth={2.1} />
              <span className="text-[13px] font-medium leading-none tracking-wide text-[#2a1d18]">
                {content.locale[locale]}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-1.5 text-[14px] font-normal leading-[1.65] text-[#6d5c52]">
          {content.home[locale]}
        </div>
      </header>

      <OverlayRoot
        open={connect_open}
        on_close={() => set_connect_open(false)}
        variant="center"
      >
        <ConnectModal on_close={() => set_connect_open(false)} />
      </OverlayRoot>
    </>
  )
}
