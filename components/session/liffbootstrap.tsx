'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

type bootstrap_liff_profile = {
  userId: string
  displayName?: string
  pictureUrl?: string
}

type bootstrap_liff_client = {
  init: (input: { liffId: string }) => Promise<void>
  isLoggedIn: () => boolean
  login: (input?: { redirectUri?: string }) => void
  getProfile: () => Promise<bootstrap_liff_profile>
  getLanguage: () => string
}

type session_response = {
  visitor_uuid?: string | null
  line_connected?: boolean
}

function is_line_browser() {
  const ua = navigator.userAgent.toLowerCase()

  return ua.includes('line/') || ua.includes('liff')
}

function get_window_liff() {
  return (window as unknown as { liff?: bootstrap_liff_client }).liff
}

function should_skip_path(pathname: string | null) {
  return (
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/driver') ||
    pathname?.startsWith('/liff') ||
    pathname?.startsWith('/api')
  )
}

function load_liff_sdk() {
  return new Promise<bootstrap_liff_client>((resolve, reject) => {
    const existing_liff = get_window_liff()

    if (existing_liff) {
      resolve(existing_liff)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js'
    script.async = true
    script.onload = () => {
      const loaded_liff = get_window_liff()

      if (loaded_liff) {
        resolve(loaded_liff)
        return
      }

      reject(new Error('LIFF SDK was not loaded'))
    }
    script.onerror = () => reject(new Error('LIFF SDK load failed'))

    document.head.appendChild(script)
  })
}

async function ensure_browser_session() {
  const response = await fetch('/api/session', {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as session_response
}

export default function LiffBootstrap() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (should_skip_path(pathname) || !is_line_browser()) {
      return
    }

    const liff_id = process.env.NEXT_PUBLIC_LIFF_ID

    if (!liff_id) {
      return
    }

    let cancelled = false
    const resolved_liff_id = liff_id

    async function run_liff_bootstrap() {
      try {
        const session = await ensure_browser_session()

        if (cancelled || session?.line_connected) {
          return
        }

        const liff = await load_liff_sdk()

        if (cancelled) {
          return
        }

        await liff.init({ liffId: resolved_liff_id })

        if (!liff.isLoggedIn()) {
          liff.login({
            redirectUri: window.location.href,
          })
          return
        }

        const profile = await liff.getProfile()
        const locale = liff.getLanguage()

        const response = await fetch('/api/auth/liff', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            line_user_id: profile.userId,
            display_name: profile.displayName ?? null,
            picture_url: profile.pictureUrl ?? null,
            image_url: profile.pictureUrl ?? null,
            locale,
            visitor_uuid: session?.visitor_uuid ?? null,
          }),
        })

        if (!cancelled && response.ok) {
          router.refresh()
        }
      } catch {
        // Keep guest access when LIFF bootstrap cannot complete.
      }
    }

    void run_liff_bootstrap()

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  return null
}
