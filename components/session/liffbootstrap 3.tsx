'use client'

import liff from '@line/liff'
import { useEffect, useState } from 'react'

import Loading from '@/components/shared/loading'

function should_skip_path(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/driver') ||
    pathname.startsWith('/api')
  )
}

function is_line_browser_or_liff_url(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const ua = navigator.userAgent.toLowerCase()

  return ua.includes('line/') || window.location.href.includes('liff.line.me')
}

export default function LiffBootstrap() {
  const [is_loading, set_is_loading] = useState(false)
  const [liff_error, set_liff_error] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (should_skip_path(window.location.pathname)) {
      return
    }

    if (!is_line_browser_or_liff_url()) {
      return
    }

    set_is_loading(true)
    set_liff_error(null)

    async function run() {
      const liff_id = process.env.NEXT_PUBLIC_LIFF_ID ?? ''

      if (!liff_id) {
        console.log('[liff] missing liff id')
        set_is_loading(false)
        set_liff_error('LIFF ID is not configured (NEXT_PUBLIC_LIFF_ID)')

        return
      }

      console.log('[liff] bootstrap mounted')
      console.log('[liff] liff_id', liff_id)
      console.log('[liff] href', window.location.href)
      console.log('[liff] user_agent', navigator.userAgent)

      try {
        await liff.init({ liffId: liff_id })

        console.log('[liff] init completed')
        console.log('[liff] isInClient', liff.isInClient())
        console.log('[liff] isLoggedIn', liff.isLoggedIn())

        async function complete_liff_auth(profile: {
          userId: string
          displayName?: string
          pictureUrl?: string
          statusMessage?: string
        }) {
          const global_gate = globalThis as unknown as {
            __amp_liff_auth_inflight?: boolean
          }

          if (global_gate.__amp_liff_auth_inflight) {
            set_is_loading(false)

            return
          }

          global_gate.__amp_liff_auth_inflight = true

          console.log('[liff] profile', profile)

          const response = await fetch('/api/auth/liff', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              line_user_id: profile.userId,
              display_name: profile.displayName ?? null,
              picture_url: profile.pictureUrl ?? null,
              status_message: profile.statusMessage ?? null,
              source_channel: 'liff',
            }),
          })

          const result = await response.json().catch(() => null)

          console.log('[liff] auth api result', result)
          console.log('[liff] auth response status', response.status)

          if (!response.ok) {
            const msg =
              result &&
              typeof result === 'object' &&
              'error' in result &&
              typeof (result as { error?: string }).error === 'string'
                ? (result as { error: string }).error
                : `HTTP ${response.status}`
            set_liff_error(msg)
            console.error('[liff] auth API error', response.status, result)
          } else if (
            result &&
            typeof result === 'object' &&
            'ok' in result &&
            result.ok === true
          ) {
            window.dispatchEvent(new Event('amp_session_changed'))
          }

          set_is_loading(false)
        }

        if (liff.isInClient()) {
          const profile = await liff.getProfile()

          await complete_liff_auth(profile)

          return
        }

        if (!liff.isLoggedIn()) {
          console.log('[liff] liff_id', liff_id)
          console.log('[liff] href before login', window.location.href)
          console.log('[liff] origin', window.location.origin)
          console.log('[liff] pathname', window.location.pathname)
          console.log('[liff] login started')
          liff.login()

          return
        }

        const profile = await liff.getProfile()

        await complete_liff_auth(profile)
      } catch (error) {
        console.error('[liff] bootstrap failed', error)
        set_liff_error(
          error instanceof Error ? error.message : 'LIFF bootstrap failed',
        )
        set_is_loading(false)
      }
    }

    void run()
  }, [])

  return (
    <>
      {is_loading ? (
        <Loading full_screen text="LOADING..." />
      ) : null}
      {liff_error ? (
        <div
          className="fixed bottom-4 left-1/2 z-[10000] max-w-[90vw] -translate-x-1/2 rounded-md bg-red-900/90 px-3 py-2 text-center text-[11px] text-white shadow-lg"
          role="alert"
        >
          {liff_error}
        </div>
      ) : null}
    </>
  )
}
