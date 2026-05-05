'use client'

import liff from '@line/liff'
import { useEffect } from 'react'

function resolve_liff_id() {
  return (
    process.env.NEXT_PUBLIC_LINE_LIFF_ID ??
    process.env.NEXT_PUBLIC_LIFF_ID ??
    ''
  )
}

function should_skip_path(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/driver') ||
    pathname.startsWith('/api')
  )
}

export default function LiffBootstrap() {
  useEffect(() => {
    async function run() {
      if (typeof window === 'undefined') {
        return
      }

      if (should_skip_path(window.location.pathname)) {
        return
      }

      const liff_id = resolve_liff_id()

      if (!liff_id) {
        console.log('[liff] missing liff id')

        return
      }

      console.log('[liff] bootstrap mounted')
      console.log('[liff] liff_id', liff_id)
      console.log('[liff] href', window.location.href)
      console.log('[liff] user_agent', navigator.userAgent)

      await liff.init({ liffId: liff_id })

      console.log('[liff] init completed')
      console.log('[liff] isInClient', liff.isInClient())
      console.log('[liff] isLoggedIn', liff.isLoggedIn())

      const ua = navigator.userAgent.toLowerCase()
      const is_liff_url = window.location.href.includes('liff.line.me')
      const is_line_browser = ua.includes('line/')
      const is_inside_line =
        liff.isInClient() || is_liff_url || is_line_browser

      if (!is_inside_line) {
        console.log('[liff] not line environment, skip')

        return
      }

      if (!liff.isLoggedIn()) {
        console.log('[liff] login started')
        liff.login()

        return
      }

      const global_gate = globalThis as unknown as {
        __amp_liff_auth_inflight?: boolean
      }

      if (global_gate.__amp_liff_auth_inflight) {
        return
      }

      global_gate.__amp_liff_auth_inflight = true

      const profile = await liff.getProfile()

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

      if (
        response.ok &&
        result &&
        typeof result === 'object' &&
        'ok' in result &&
        result.ok === true
      ) {
        window.dispatchEvent(new Event('amp_session_changed'))
      }
    }

    void run().catch((error) => {
      console.error('[liff] bootstrap failed', error)
    })
  }, [])

  return null
}
