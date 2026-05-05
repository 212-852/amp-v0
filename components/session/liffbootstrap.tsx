'use client'

import liff from '@line/liff'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

function is_liff_url() {
  return window.location.href.includes('liff.line.me')
}

function should_skip_path(pathname: string | null) {
  return (
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/driver') ||
    pathname?.startsWith('/api')
  )
}

async function ensure_browser_session() {
  await fetch('/api/session', {
    method: 'GET',
    credentials: 'include',
  })
}

export default function LiffBootstrap() {
  const pathname = usePathname()
  const started_ref = useRef(false)

  useEffect(() => {
    if (started_ref.current || should_skip_path(pathname)) {
      return
    }

    started_ref.current = true

    async function run() {
      const liff_id = process.env.NEXT_PUBLIC_LINE_LIFF_ID

      console.log('[liff] bootstrap mounted')
      console.log('[liff] liff_id', liff_id ?? null)

      if (!liff_id) {
        return
      }

      console.info('[DEBUG] LIFF', {
        event: 'liff_bootstrap_started',
      })

      await liff.init({ liffId: liff_id })

      console.log('[liff] init completed')
      console.log('[liff] isInClient', liff.isInClient())
      console.log('[liff] isLoggedIn', liff.isLoggedIn())

      console.info('[DEBUG] LIFF', {
        event: 'liff_initialized',
      })

      if (!liff.isInClient() && !is_liff_url()) {
        return
      }

      await ensure_browser_session()

      if (!liff.isLoggedIn()) {
        console.info('[DEBUG] LIFF', {
          event: 'liff_login_started',
        })
        liff.login()
        return
      }

      const profile = await liff.getProfile()
      const locale = liff.getLanguage()

      console.log('[liff] profile', profile)

      console.info('[DEBUG] LIFF', {
        event: 'liff_profile_resolved',
      })

      const response = await fetch('/api/auth/liff', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          line_user_id: profile.userId,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl ?? null,
          status_message: profile.statusMessage ?? null,
          locale,
          source_channel: 'liff',
        }),
      })
      const result = await response.json().catch(() => null)

      console.log('[liff] auth api result', result)

      if (response.ok) {
        window.dispatchEvent(new Event('amp_session_changed'))
      }
    }

    void run().catch(console.error)
  }, [pathname])

  return null
}
