'use client'

import liff from '@line/liff'
import { useEffect, useRef } from 'react'

function should_skip_path(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/driver') ||
    pathname.startsWith('/api')
  )
}

function is_line_browser() {
  return navigator.userAgent.toLowerCase().includes('line/')
}

function is_liff_url() {
  return window.location.href.includes('liff.line.me')
}

function has_liff_params() {
  const params = new URLSearchParams(window.location.search)

  return params.has('liff.state') || params.has('liffClientId')
}

export default function LiffBootstrap() {
  const started_ref = useRef(false)

  useEffect(() => {
    if (started_ref.current || should_skip_path(window.location.pathname)) {
      return
    }

    started_ref.current = true

    async function run() {
      console.log('[liff] bootstrap mounted')

      const liff_id = process.env.NEXT_PUBLIC_LIFF_ID

      console.log('[liff] liff_id', liff_id ?? null)

      if (!liff_id) {
        return
      }

      await liff.init({ liffId: liff_id })

      console.log('[liff] init completed')
      console.log('[liff] isInClient', liff.isInClient())
      console.log('[liff] isLoggedIn', liff.isLoggedIn())

      const is_inside_liff =
        liff.isInClient() || is_liff_url() || is_line_browser() || has_liff_params()

      if (!is_inside_liff && !liff.isLoggedIn()) {
        return
      }

      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }

      const profile = await liff.getProfile()

      console.log('[liff] profile', profile)

      const response = await fetch('/api/auth/liff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          line_user_id: profile.userId,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl ?? null,
          status_message: profile.statusMessage ?? null,
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
  }, [])

  return null
}
