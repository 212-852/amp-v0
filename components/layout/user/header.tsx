'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, Globe2 } from 'lucide-react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'

import ConnectModal from '@/components/modal/connect'
import LocaleModal from '@/components/modal/locale'
import OverlayRoot from '@/components/overlay/root'
import Breadcrumb from '@/components/shared/breadcrumb'
import Loading from '@/components/shared/loading'
import { build_breadcrumb } from '@/lib/breadcrumb'
import {
  type locale_key,
} from '@/lib/locale/action'
import {
  apply_locale_from_session,
  set_locale as set_locale_state,
  subscribe_locale,
} from '@/lib/locale/state'

const content = {
  guest: {
    ja: 'ゲスト',
    en: 'Guest',
    es: 'Invitado',
  },
  member: {
    ja: 'メンバー',
    en: 'Member',
    es: 'Miembro',
  },
  connect: {
    ja: '連携',
    en: 'Connect',
    es: 'Conectar',
  },
  connected: {
    ja: '連携済み',
    en: 'Connected',
    es: 'Conectado',
  },
  locale: {
    ja: 'JA',
    en: 'EN',
    es: 'ES',
  },
}

type session_response = {
  locale?: locale_key
  role?: 'user' | 'driver' | 'admin' | 'guest'
  tier?: 'guest' | 'member' | 'vip'
  display_name?: string | null
  line_connected?: boolean
  connected_providers?: Array<'line' | 'google' | 'email'>
  requires_line_auth?: boolean
  line_auth_method?: string | null
}

export default function UserHeader() {
  const pathname = usePathname()
  const [mounted, set_mounted] = useState(false)
  const [locale, set_locale] = useState<locale_key>('ja')
  const [session, set_session] = useState<session_response>({
    locale: 'ja',
    role: 'guest',
    tier: 'guest',
    display_name: null,
    line_connected: false,
    connected_providers: [],
  })
  const [connect_open, set_connect_open] = useState(false)
  const [locale_open, set_locale_open] = useState(false)
  const [session_ready, set_session_ready] = useState(false)
  const render_locale = mounted ? locale : 'ja'
  const is_member = session.tier === 'member'
  const status_label = is_member
    ? content.member[render_locale]
    : content.guest[render_locale]
  const connected_for_modal =
    (session.connected_providers?.length ?? 0) > 0
      ? (session.connected_providers ?? [])
      : session.line_connected
        ? (['line'] as Array<'line' | 'google' | 'email'>)
        : []
  const has_linked_provider =
    connected_for_modal.length > 0
  const connect_label = has_linked_provider
    ? content.connected[render_locale]
    : content.connect[render_locale]
  const breadcrumb_items = useMemo(
    () => build_breadcrumb(pathname ?? '/', render_locale),
    [pathname, render_locale],
  )

  function handle_locale_select(next_locale: locale_key) {
    set_locale_state(next_locale)
    set_locale_open(false)
  }

  useEffect(() => {
    let cancelled = false
    const unsubscribe_locale = subscribe_locale(set_locale)
    const mounted_timer = window.setTimeout(() => {
      set_mounted(true)
      apply_locale_from_session(undefined)
    }, 0)
    fetch('/api/session', {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => response.json() as Promise<session_response>)
      .then((session) => {
        if (cancelled) {
          return
        }

        set_session(session)

        apply_locale_from_session(session.locale)

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
          return
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          set_session_ready(true)
        }
      })

    return () => {
      cancelled = true
      window.clearTimeout(mounted_timer)
      unsubscribe_locale()
    }
  }, [])

  if (!session_ready && pathname !== '/liff') {
    const loading = <Loading full_screen text="LOADING..." />

    if (typeof document === 'undefined') {
      return loading
    }

    return createPortal(loading, document.body)
  }

  return (
    <>
      <header className="border-b border-[#e0cbb7] bg-[#efd7c3] px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href="/user"
              className="inline-block shrink-0 text-[17px] font-semibold tracking-[0.02em] leading-[1.35] text-[#2a1d18]"
            >
              PET TAXI
            </Link>

            <Breadcrumb items={breadcrumb_items} />
          </div>

          <div className="flex shrink-0 flex-col items-end">
            <div className="flex min-w-0 translate-y-[1px] items-center gap-1.5">
              <span className="rounded-full bg-white/55 px-[11px] py-1 text-[11px] font-medium leading-[1.35] text-[#6d5c52]">
                {status_label}
              </span>

              <button
                type="button"
                onClick={() => set_connect_open(true)}
                className="rounded-full border border-[#d3c4b8] bg-white px-[11px] py-1 text-[11px] font-medium leading-[1.35] shadow-[0_1px_3px_rgba(42,29,24,0.06)]"
              >
                {connect_label}
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
                onClick={() => set_locale_open(true)}
                className="flex h-8 items-center gap-0.5"
                aria-label="Language"
              >
                <Globe2 size={22} strokeWidth={2.1} />
                <span className="text-[13px] font-medium leading-none tracking-wide text-[#2a1d18]">
                  {content.locale[render_locale]}
                </span>
              </button>
            </div>

            {session.display_name ? (
              <div className="mt-1 max-w-[180px] truncate text-right text-[11px] font-medium tracking-[0.01em] text-[#8a7568]">
                {session.display_name}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <OverlayRoot
        open={connect_open}
        on_close={() => set_connect_open(false)}
        variant="center"
      >
        <ConnectModal
          locale={render_locale}
          connected_providers={connected_for_modal}
          on_close={() => set_connect_open(false)}
        />
      </OverlayRoot>

      <OverlayRoot
        open={locale_open}
        on_close={() => set_locale_open(false)}
        variant="center"
      >
        <LocaleModal
          locale={render_locale}
          on_select={handle_locale_select}
          on_close={() => set_locale_open(false)}
        />
      </OverlayRoot>
    </>
  )
}
